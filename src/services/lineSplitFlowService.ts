import { Ledger, SplitDetail, Friend } from '../types';
import { FlexPendingTransactionData, buildGoldenLayoutFlexMessage } from './lineFlexTemplates';
import { savePendingTx, setUserState, getUserExistingLedgers } from './lineStateManager';
import { getUserFriends, ensureUserDummyFriends } from './friendService';
import { resolveLedgerMembers, prefetchLedgerMembers } from './memberResolverService';

interface SplitFlowContext {
  lineUserId: string;
  targetUserId: string;
  userName: string;
  pendingTx: FlexPendingTransactionData;
  replyToken: string;
  accessToken: string;
  sendReply: (text: string, quickReply?: any) => Promise<boolean>;
  sendFlex: (flex: any, fallbackText?: string, quickReply?: any) => Promise<boolean>;
}

/**
 * 處理使用者按下卡片上的【👥 與朋友平分】按鈕
 * 核心流程：先判定並詢問要使用哪一個共管帳本，後續再詢問要與帳本內的哪些朋友平分
 */
export async function handleSplitButtonClick(ctx: SplitFlowContext): Promise<void> {
  const { targetUserId, pendingTx, lineUserId, sendReply } = ctx;

  const existingLedgers = await getUserExistingLedgers(targetUserId);
  const sharedLedgers = existingLedgers.filter((l) => l.isShared);

  if (sharedLedgers.length === 0) {
    // 使用者尚未建立任何共管帳本
    await setUserState(lineUserId, {
      state: 'WAITING_SPLIT',
      tempTxId: pendingTx.tempTxId,
      updatedAt: Date.now(),
    });

    const noSharedQuickReply = {
      items: [
        {
          type: 'action',
          action: { type: 'message', label: '👥 跟小美平分', text: '跟小美平分' },
        },
        {
          type: 'action',
          action: { type: 'message', label: '👥 3人平分', text: '3人平分' },
        },
        {
          type: 'action',
          action: { type: 'message', label: '❌ 取消分帳', text: '取消分帳' },
        },
      ],
    };

    await sendReply(
      `⚠️ 系統偵測到您目前尚未建立任何【共管帳本】！\n\n平分記帳需要搭配共管帳本才能與好友進行 AA 結算與平帳。建議您先至 Web 系統建立共管帳本並加入好友。\n\n若您想在現有個人帳本臨時記上一筆分帳備忘，請直接輸入或點選下方按鈕（例如「跟小美平分」）：`,
      noSharedQuickReply
    );
    return;
  }

  // 步驟 1：詢問要使用哪一個共管帳本
  await setUserState(lineUserId, {
    state: 'WAITING_SPLIT_LEDGER',
    tempTxId: pendingTx.tempTxId,
    updatedAt: Date.now(),
  });

  const ledgerListText = sharedLedgers
    .map((l, idx) => `${idx + 1}. 👥 ${l.name} (${l.currency || 'TWD'})`)
    .join('\n');

  const quickReplyItems: any[] = sharedLedgers.slice(0, 10).map((l) => ({
    type: 'action',
    action: {
      type: 'postback',
      label: `👥 ${l.name}`.slice(0, 20),
      data: `action=split_choose_ledger&id=${pendingTx.tempTxId}&ledgerId=${l.id}`,
      displayText: `選擇帳本：${l.name}`,
    },
  }));

  quickReplyItems.push({
    type: 'action',
    action: {
      type: 'postback',
      label: '❌ 取消分帳',
      data: `action=split_cancel&id=${pendingTx.tempTxId}`,
      displayText: '取消分帳',
    },
  });

  const promptMsg = `👥 【步驟 1/2：請選擇分帳之共管帳本】\n\n請選擇欲使用哪一個共管帳本進行 AA 平分：\n\n${ledgerListText}\n\n💬 請直接點選下方按鈕，或回傳帳本編號（例如「1」）：`;

  await sendReply(promptMsg, { items: quickReplyItems });
}

/**
 * 步驟 1 完成：選定共管帳本後，接續觸發步驟 2 (詢問要與帳本內的哪些朋友平分)
 */
export async function promptSplitMembersForLedger(
  ctx: SplitFlowContext,
  chosenLedger: Ledger
): Promise<void> {
  const { lineUserId, targetUserId, userName, pendingTx, sendReply } = ctx;

  // 1. 同步暫存交易的帳本資料
  pendingTx.ledgerId = chosenLedger.id;
  pendingTx.ledgerName = chosenLedger.name;
  pendingTx.isSharedLedger = true;
  if (chosenLedger.currency) {
    pendingTx.currency = chosenLedger.currency;
  }
  pendingTx.noSharedLedgerWarning = undefined;
  await savePendingTx(pendingTx);

  // 2. 撈取該帳本成員與好友名單
  let friends = await getUserFriends(targetUserId, lineUserId);
  if ((!friends || friends.length === 0) && targetUserId) {
    try {
      const dummies = await ensureUserDummyFriends(targetUserId);
      if (dummies && dummies.length > 0) {
        friends = dummies;
      }
    } catch {}
  }

  await prefetchLedgerMembers(chosenLedger.memberIds || []);
  const resolvedMembers = resolveLedgerMembers(
    chosenLedger.memberIds,
    friends,
    targetUserId,
    userName
  );

  const otherMembers = resolvedMembers.filter((m) => !m.isMe);

  await setUserState(lineUserId, {
    state: 'WAITING_SPLIT_MEMBERS',
    tempTxId: pendingTx.tempTxId,
    targetLedgerId: chosenLedger.id,
    updatedAt: Date.now(),
  });

  if (otherMembers.length > 0) {
    const memberListStr = otherMembers
      .map((m, idx) => `${idx + 1}. ${m.rawName || m.name}`)
      .join('、');

    const quickReplyItems: any[] = [
      {
        type: 'action',
        action: {
          type: 'postback',
          label: '🌟 全員平分',
          data: `action=split_members_submit&id=${pendingTx.tempTxId}&members=all&ledgerId=${chosenLedger.id}`,
          displayText: '🌟 全員平分',
        },
      },
    ];

    for (const m of otherMembers.slice(0, 9)) {
      const displayName = m.rawName || m.name;
      quickReplyItems.push({
        type: 'action',
        action: {
          type: 'postback',
          label: `👥 跟${displayName}平分`.slice(0, 20),
          data: `action=split_members_submit&id=${pendingTx.tempTxId}&members=${encodeURIComponent(displayName)}&ledgerId=${chosenLedger.id}`,
          displayText: `跟${displayName}平分`,
        },
      });
    }

    quickReplyItems.push({
      type: 'action',
      action: {
        type: 'postback',
        label: '❌ 取消分帳',
        data: `action=split_cancel&id=${pendingTx.tempTxId}`,
        displayText: '取消分帳',
      },
    });

    const promptText = `👥 【步驟 2/2：請選擇平分成員】\n\n已選定共管帳本：【${chosenLedger.name}】\n帳本現有成員：${memberListStr}\n\n💬 請直接點選下方成員、回傳成員名稱（例如「${otherMembers[0].rawName || otherMembers[0].name}」），亦可輸入「全員平分」、「3人平分」：`;

    await sendReply(promptText, { items: quickReplyItems });
  } else {
    // 帳本內尚無其他成員，引導輸入姓名或人數
    const quickReplyItems = {
      items: [
        {
          type: 'action',
          action: { type: 'message', label: '👥 跟小美平分', text: '跟小美平分' },
        },
        {
          type: 'action',
          action: { type: 'message', label: '👥 2人平分', text: '2人平分' },
        },
        {
          type: 'action',
          action: {
            type: 'postback',
            label: '❌ 取消分帳',
            data: `action=split_cancel&id=${pendingTx.tempTxId}`,
            displayText: '取消分帳',
          },
        },
      ],
    };

    const promptText = `👥 【步驟 2/2：請輸入平分成員】\n\n已選定共管帳本：【${chosenLedger.name}】\n（目前帳本內尚無其他成員）\n\n💬 請輸入欲平分的好友名稱或人數（例如「跟小美平分」或「2人平分」）：`;

    await sendReply(promptText, quickReplyItems);
  }
}

/**
 * 執行平分計算並更新暫存卡片
 */
export async function executeSplitWithMembers(
  ctx: SplitFlowContext,
  chosenLedger: Ledger,
  memberInput: string
): Promise<void> {
  const { lineUserId, targetUserId, userName, pendingTx, sendFlex } = ctx;

  // 1. 取得該共管帳本的成員清單
  let friends = await getUserFriends(targetUserId, lineUserId);
  if ((!friends || friends.length === 0) && targetUserId) {
    try {
      const dummies = await ensureUserDummyFriends(targetUserId);
      if (dummies && dummies.length > 0) {
        friends = dummies;
      }
    } catch {}
  }

  await prefetchLedgerMembers(chosenLedger.memberIds || []);
  const resolvedMembers = resolveLedgerMembers(
    chosenLedger.memberIds,
    friends,
    targetUserId,
    userName
  );
  const otherMembers = resolvedMembers.filter((m) => !m.isMe);

  const cleanInput = decodeURIComponent(memberInput || '').trim();
  const currency = chosenLedger.currency || pendingTx.currency || 'TWD';
  let splitDetails: SplitDetail[] = [];
  let splitNames: string[] = [];
  let splitNote = '';

  // 情境 A：全員平分
  if (/^all$/i.test(cleanInput) || /全員|全部|全體|大家|所有/i.test(cleanInput)) {
    const totalParticipants = 1 + otherMembers.length;
    const perPerson = Math.round((pendingTx.amount / totalParticipants) * 100) / 100;

    splitDetails = [
      {
        memberId: targetUserId,
        memberName: userName || '本人',
        amount: perPerson,
        isSettled: true,
      },
      ...otherMembers.map((m) => ({
        memberId: m.id,
        memberName: m.rawName || m.name,
        amount: perPerson,
        isSettled: false,
      })),
    ];
    splitNames = otherMembers.map((m) => m.rawName || m.name);
    splitNote = `${totalParticipants}人均分 (每人 ${currency} ${perPerson.toLocaleString()} 元) - 全員均分`;
  }
  // 情境 B：X人平分 (例如「3人平分」、「2人均分」)
  else if (/([2-9二兩三四五六七八九])\s*人/i.test(cleanInput)) {
    const numMap: Record<string, number> = {
      二: 2,
      兩: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
    };
    const m = cleanInput.match(/([2-9二兩三四五六七八九])\s*人/i);
    const count = m ? numMap[m[1]] || parseInt(m[1], 10) : 2;
    const totalParticipants = Math.max(2, count);
    const perPerson = Math.round((pendingTx.amount / totalParticipants) * 100) / 100;

    const assignedOther = otherMembers.slice(0, totalParticipants - 1);
    while (assignedOther.length < totalParticipants - 1) {
      const idx = assignedOther.length + 1;
      assignedOther.push({
        id: `virtual_member_${idx}`,
        name: `成員${idx}`,
        rawName: `成員${idx}`,
        isMe: false,
        isDummy: true,
        rawIds: [],
      });
    }

    splitDetails = [
      {
        memberId: targetUserId,
        memberName: userName || '本人',
        amount: perPerson,
        isSettled: true,
      },
      ...assignedOther.map((m) => ({
        memberId: m.id,
        memberName: m.rawName || m.name,
        amount: perPerson,
        isSettled: false,
      })),
    ];
    splitNames = assignedOther.map((m) => m.rawName || m.name);
    splitNote = `${totalParticipants}人均分 (每人 ${currency} ${perPerson.toLocaleString()} 元)`;
  }
  // 情境 C：指定特定成員名稱或編號 (例如「跟小美平分」、「小美、阿倫」、「1」、「1、2」)
  else {
    const rawItems = cleanInput
      .replace(/跟|與|和|同|分帳|平分|算/g, ' ')
      .split(/[、,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const targetMembers: { id: string; name: string }[] = [];

    for (const item of rawItems) {
      // 檢查是否為數字編號 (例如「1」代表第一個成員)
      const numIdx = parseInt(item, 10);
      if (!isNaN(numIdx) && numIdx >= 1 && numIdx <= otherMembers.length) {
        const found = otherMembers[numIdx - 1];
        if (!targetMembers.some((t) => t.id === found.id)) {
          targetMembers.push({ id: found.id, name: found.rawName || found.name });
        }
        continue;
      }

      // 檢查名稱匹配
      const cleanItemName = item.toLowerCase();
      let matched = otherMembers.find(
        (m) =>
          (m.rawName || m.name).toLowerCase() === cleanItemName ||
          (m.rawName || m.name).toLowerCase().includes(cleanItemName) ||
          cleanItemName.includes((m.rawName || m.name).toLowerCase())
      );

      if (!matched && friends) {
        const matchedFriend = friends.find(
          (f) =>
            f.name.toLowerCase() === cleanItemName ||
            f.name.toLowerCase().includes(cleanItemName) ||
            cleanItemName.includes(f.name.toLowerCase())
        );
        if (matchedFriend) {
          matched = {
            id: matchedFriend.friendUserId || matchedFriend.id,
            name: matchedFriend.name,
            rawName: matchedFriend.name,
            isMe: false,
            isDummy: !!matchedFriend.isDummy,
            rawIds: [],
          };
        }
      }

      if (matched) {
        if (!targetMembers.some((t) => t.id === matched!.id)) {
          targetMembers.push({ id: matched.id, name: matched.rawName || matched.name });
        }
      } else if (item.length > 0) {
        // 未匹配好友，作為臨時成員記錄
        targetMembers.push({ id: `custom_friend_${item}`, name: item });
      }
    }

    if (targetMembers.length === 0 && otherMembers.length > 0) {
      targetMembers.push({
        id: otherMembers[0].id,
        name: otherMembers[0].rawName || otherMembers[0].name,
      });
    }

    const totalParticipants = 1 + targetMembers.length;
    const perPerson = Math.round((pendingTx.amount / totalParticipants) * 100) / 100;

    splitDetails = [
      {
        memberId: targetUserId,
        memberName: userName || '本人',
        amount: perPerson,
        isSettled: true,
      },
      ...targetMembers.map((m) => ({
        memberId: m.id,
        memberName: m.name,
        amount: perPerson,
        isSettled: false,
      })),
    ];
    splitNames = targetMembers.map((m) => m.name);
    splitNote = `${totalParticipants}人均分 (每人 ${currency} ${perPerson.toLocaleString()} 元) - 本人、${splitNames.join('、')}`;
  }

  // 套用並更新暫存交易
  pendingTx.isSharedLedger = true;
  pendingTx.ledgerId = chosenLedger.id;
  pendingTx.ledgerName = chosenLedger.name;
  pendingTx.currency = currency;
  pendingTx.splitDetails = splitDetails;
  pendingTx.splitNames = splitNames;
  pendingTx.splitNote = splitNote;
  pendingTx.noSharedLedgerWarning = undefined;

  await savePendingTx(pendingTx);
  await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

  const flexMsg = buildGoldenLayoutFlexMessage(pendingTx);
  await sendFlex(
    flexMsg,
    `✅ 已更新共管帳本【${chosenLedger.name}】平分設定（${splitDetails.length}人均分）！請點擊上方卡片確認入帳。`
  );
}

/**
 * 取消平分設定，轉回個人私密記帳
 */
export async function cancelSplit(ctx: SplitFlowContext): Promise<void> {
  const { lineUserId, targetUserId, pendingTx, sendFlex } = ctx;

  const existingLedgers = await getUserExistingLedgers(targetUserId);
  const personalLedger = existingLedgers.find((l) => !l.isShared) || existingLedgers[0];

  if (personalLedger) {
    pendingTx.ledgerId = personalLedger.id;
    pendingTx.ledgerName = personalLedger.name;
    pendingTx.isSharedLedger = personalLedger.isShared;
  }
  pendingTx.splitDetails = undefined;
  pendingTx.splitNames = [];
  pendingTx.splitNote = undefined;
  pendingTx.noSharedLedgerWarning = undefined;

  await savePendingTx(pendingTx);
  await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

  const flexMsg = buildGoldenLayoutFlexMessage(pendingTx);
  await sendFlex(flexMsg, `✅ 已取消平分設定，已轉為個人記帳！請點擊確認入帳。`);
}
