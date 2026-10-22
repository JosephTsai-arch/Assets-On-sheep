import React from 'react';

/**
 * 吉祥物矩陣 (Mascots)
 * 1. 資產上羊 (AssetSheepMascot)：頭戴金皇冠、背馱金磚珠寶錢袋、胸前「資產上羊 WEALTH UPWARD ASSET GO UP!」金幟布旗、綠色斗篷、踩踏金幣台座、頭頂 %300% 成長之超萌吉祥物
 * 2. 熊熊小幫手：頂部選單小幫手
 * 3. 小豬存錢筒：資產錢包小幫手
 * 4. 旅行插畫小組：外幣旅行帳本
 */

export const AssetSheepMascot: React.FC<{ className?: string; size?: number }> = ({
  className = '',
  size = 64,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 500 500"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none overflow-visible ${className}`}
  >
    <defs>
      {/* 漸層與濾鏡定義 */}
      <linearGradient id="goldCoinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FEF08A" />
        <stop offset="40%" stopColor="#FDE047" />
        <stop offset="70%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#D97706" />
      </linearGradient>

      <linearGradient id="goldBarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FEF08A" />
        <stop offset="35%" stopColor="#FBBF24" />
        <stop offset="100%" stopColor="#D97706" />
      </linearGradient>

      <linearGradient id="moneyBagGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#D97706" />
        <stop offset="50%" stopColor="#B45309" />
        <stop offset="100%" stopColor="#78350F" />
      </linearGradient>

      <linearGradient id="moneyBagLight" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#EAB308" />
        <stop offset="100%" stopColor="#A16207" />
      </linearGradient>

      <linearGradient id="diamondGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#E0F2FE" />
        <stop offset="50%" stopColor="#7DD3FC" />
        <stop offset="100%" stopColor="#0284C7" />
      </linearGradient>

      <linearGradient id="capeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#22C55E" />
        <stop offset="70%" stopColor="#15803D" />
        <stop offset="100%" stopColor="#14532D" />
      </linearGradient>

      <linearGradient id="percentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#A7F3D0" />
        <stop offset="100%" stopColor="#34D399" />
      </linearGradient>

      <linearGradient id="bannerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFFBEB" />
        <stop offset="50%" stopColor="#FEF3C7" />
        <stop offset="100%" stopColor="#FDE68A" />
      </linearGradient>

      <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.12" />
      </filter>
    </defs>

    {/* ===== 1. 背景微光天色與自然彩虹日輪 (Pastoral Background) ===== */}
    <g opacity="0.95">
      {/* 太陽公公 (Top-Right) */}
      <g transform="translate(420, 55)">
        <circle cx="0" cy="0" r="32" fill="#FDE047" stroke="#F59E0B" strokeWidth="2.5" />
        {/* 太陽光芒 */}
        <line x1="-42" y1="0" x2="-36" y2="0" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
        <line x1="42" y1="0" x2="36" y2="0" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
        <line x1="0" y1="-42" x2="0" y2="-36" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
        <line x1="0" y1="42" x2="0" y2="36" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
        <line x1="-30" y1="-30" x2="-25" y2="-25" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
        <line x1="30" y1="-30" x2="25" y2="-25" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
        {/* 太陽可愛微笑與腮紅 */}
        <circle cx="-10" cy="-4" r="3" fill="#78350F" />
        <circle cx="10" cy="-4" r="3" fill="#78350F" />
        <circle cx="-16" cy="4" r="4.5" fill="#FB7185" opacity="0.6" />
        <circle cx="16" cy="4" r="4.5" fill="#FB7185" opacity="0.6" />
        <path d="M-6 6 Q0 12 6 6" stroke="#78350F" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      </g>

      {/* 彩虹 (Top-Left) */}
      <g opacity="0.85">
        <path d="M 5 235 A 150 150 0 0 1 125 185" stroke="#FB7185" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M 10 240 A 145 145 0 0 1 120 192" stroke="#FB923C" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M 15 245 A 140 140 0 0 1 115 199" stroke="#FCD34D" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M 20 250 A 135 135 0 0 1 110 206" stroke="#34D399" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M 25 255 A 130 130 0 0 1 105 213" stroke="#60A5FA" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M 30 260 A 125 125 0 0 1 100 220" stroke="#A78BFA" strokeWidth="5" fill="none" strokeLinecap="round" />
      </g>

      {/* 微笑白雲 */}
      <g transform="translate(45, 95)" opacity="0.8">
        <ellipse cx="25" cy="0" rx="35" ry="18" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1.5" />
        <circle cx="5" cy="-8" r="16" fill="#FFFFFF" />
        <circle cx="35" cy="-10" r="18" fill="#FFFFFF" />
        <circle cx="16" cy="-2" r="1.5" fill="#64748B" />
        <circle cx="30" cy="-2" r="1.5" fill="#64748B" />
        <path d="M21 2 Q23 5 25 2" stroke="#64748B" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </g>
    </g>

    {/* ===== 2. 巨大金幣底座與地面散落金幣 (Golden Coin Pedestal) ===== */}
    <g id="pedestal">
      {/* 底部陰影 */}
      <ellipse cx="250" cy="455" rx="195" ry="38" fill="#D6D3D1" opacity="0.4" />
      {/* 金幣基座厚度側邊 */}
      <path
        d="M 60 380 Q 250 435 440 380 L 440 425 Q 250 480 60 425 Z"
        fill="#D97706"
        stroke="#92400E"
        strokeWidth="3"
      />
      {/* 側邊直紋金幣刻痕 */}
      <path d="M 120 400 L 120 440" stroke="#B45309" strokeWidth="2" opacity="0.6" />
      <path d="M 180 415 L 180 455" stroke="#B45309" strokeWidth="2" opacity="0.6" />
      <path d="M 250 420 L 250 462" stroke="#B45309" strokeWidth="2" opacity="0.6" />
      <path d="M 320 415 L 320 455" stroke="#B45309" strokeWidth="2" opacity="0.6" />
      <path d="M 380 400 L 380 440" stroke="#B45309" strokeWidth="2" opacity="0.6" />

      {/* 金幣基座頂部主圓盤 */}
      <ellipse cx="250" cy="380" rx="190" ry="48" fill="url(#goldCoinGrad)" stroke="#B45309" strokeWidth="3" />
      {/* 內圈精緻滾邊金線 */}
      <ellipse cx="250" cy="380" rx="172" ry="42" fill="#FEF08A" stroke="#F59E0B" strokeWidth="2" opacity="0.9" />

      {/* 掉落左下金幣 */}
      <g transform="translate(90, 445)">
        <ellipse cx="0" cy="0" rx="25" ry="12" fill="url(#goldCoinGrad)" stroke="#92400E" strokeWidth="2.5" />
        <ellipse cx="0" cy="0" rx="18" ry="8" fill="#FEF08A" stroke="#D97706" strokeWidth="1.5" />
      </g>
      {/* 掉落右下金幣 */}
      <g transform="translate(410, 450)">
        <ellipse cx="0" cy="0" rx="25" ry="12" fill="url(#goldCoinGrad)" stroke="#92400E" strokeWidth="2.5" />
        <ellipse cx="0" cy="0" rx="18" ry="8" fill="#FEF08A" stroke="#D97706" strokeWidth="1.5" />
      </g>
      {/* 掉落台面右前金幣 */}
      <g transform="translate(360, 395) rotate(-15)">
        <ellipse cx="0" cy="0" rx="22" ry="10" fill="url(#goldCoinGrad)" stroke="#92400E" strokeWidth="2" />
        <ellipse cx="0" cy="0" rx="16" ry="6.5" fill="#FEF08A" stroke="#D97706" strokeWidth="1" />
      </g>
    </g>

    {/* ===== 3. 背負的大財寶山 (Treasure Mountain on Back) ===== */}
    <g id="treasure-stack" filter="url(#softShadow)">
      {/* 左後方大錢袋 */}
      <g transform="translate(160, 195) rotate(-18)">
        <ellipse cx="0" cy="0" rx="42" ry="48" fill="url(#moneyBagGrad)" stroke="#5B21B6" strokeWidth="0" />
        <ellipse cx="0" cy="0" rx="42" ry="48" fill="#A16207" stroke="#78350F" strokeWidth="3" />
        {/* 束口繩結 */}
        <ellipse cx="0" cy="-42" rx="18" ry="7" fill="#FEF3C7" stroke="#92400E" strokeWidth="2" />
        <polygon points="-12,-48 0,-62 12,-48" fill="#A16207" stroke="#78350F" strokeWidth="2" />
        {/* $ 標誌 */}
        <text x="0" y="14" fontSize="32" fontWeight="900" fontFamily="Arial Black, Impact, sans-serif" fill="#451A03" textAnchor="middle" opacity="0.8">
          $
        </text>
      </g>

      {/* 右後方大錢袋 */}
      <g transform="translate(365, 230) rotate(12)">
        <ellipse cx="0" cy="0" rx="46" ry="52" fill="#B45309" stroke="#78350F" strokeWidth="3" />
        <ellipse cx="0" cy="-48" rx="20" ry="8" fill="#FEF3C7" stroke="#92400E" strokeWidth="2" />
        <polygon points="-14,-54 0,-70 14,-54" fill="#B45309" stroke="#78350F" strokeWidth="2" />
        <text x="0" y="16" fontSize="36" fontWeight="900" fontFamily="Arial Black, Impact, sans-serif" fill="#451A03" textAnchor="middle" opacity="0.8">
          $
        </text>
      </g>

      {/* 左前金幣袋 */}
      <g transform="translate(100, 315) rotate(-12)">
        <ellipse cx="0" cy="0" rx="38" ry="42" fill="#A16207" stroke="#78350F" strokeWidth="3" />
        <ellipse cx="0" cy="-38" rx="16" ry="6" fill="#FEF3C7" stroke="#92400E" strokeWidth="2" />
        <text x="0" y="12" fontSize="28" fontWeight="900" fontFamily="Arial Black, sans-serif" fill="#451A03" textAnchor="middle" opacity="0.85">
          $
        </text>
      </g>

      {/* 右下前方大錢袋 */}
      <g transform="translate(395, 325) rotate(8)">
        <ellipse cx="0" cy="0" rx="46" ry="50" fill="#A16207" stroke="#78350F" strokeWidth="3" />
        <ellipse cx="0" cy="-44" rx="20" ry="7" fill="#FEF3C7" stroke="#92400E" strokeWidth="2" />
        <text x="0" y="14" fontSize="34" fontWeight="900" fontFamily="Arial Black, sans-serif" fill="#451A03" textAnchor="middle" opacity="0.85">
          $
        </text>
      </g>

      {/* 頂部巨大的金元寶/金塊 (Huge Gold Ingot) */}
      <g transform="translate(250, 150)">
        <path
          d="M -70 20 L -90 -35 L 90 -35 L 70 20 Z"
          fill="url(#goldBarGrad)"
          stroke="#92400E"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <polygon points="-75,-35 -50,-60 50,-60 75,-35" fill="#FEF08A" stroke="#92400E" strokeWidth="3" />
        <polygon points="50,-60 75,-35 90,-35 65,-60" fill="#F59E0B" stroke="#92400E" strokeWidth="2" />
      </g>

      {/* 閃亮藍鑽石 (Diamonds) */}
      {/* 左邊大鑽石 */}
      <g transform="translate(145, 260) rotate(-15)">
        <polygon points="0,-25 22,-8 14,22 -14,22 -22,-8" fill="url(#diamondGrad)" stroke="#0369A1" strokeWidth="2.5" />
        <polygon points="0,-25 22,-8 0,5" fill="#BAE6FD" opacity="0.7" />
        <polygon points="0,-25 -22,-8 0,5" fill="#E0F2FE" opacity="0.9" />
      </g>
      {/* 右側閃亮鑽石 */}
      <g transform="translate(325, 140) rotate(15)">
        <polygon points="0,-20 18,-6 11,18 -11,18 -18,-6" fill="url(#diamondGrad)" stroke="#0369A1" strokeWidth="2.5" />
        <polygon points="0,-20 18,-6 0,4" fill="#BAE6FD" opacity="0.7" />
        <polygon points="0,-20 -18,-6 0,4" fill="#E0F2FE" opacity="0.9" />
      </g>

      {/* 閃耀十字星 (Sparkles) */}
      <g transform="translate(340, 260)">
        <path d="M0 -15 Q0 0 15 0 Q0 0 0 15 Q0 0 -15 0 Q0 0 0 -15" fill="#FEF08A" stroke="#F59E0B" strokeWidth="1" />
      </g>
      <g transform="translate(170, 310)">
        <path d="M0 -12 Q0 0 12 0 Q0 0 0 12 Q0 0 -12 0 Q0 0 0 -12" fill="#FFFFFF" stroke="#38BDF8" strokeWidth="1" />
      </g>
    </g>

    {/* ===== 4. 綠色英雄斗篷 (Emerald Cape) ===== */}
    <g id="cape">
      <path
        d="M 190 285 C 160 300, 240 330, 370 305 C 385 340, 320 370, 250 365 C 200 360, 180 320, 190 285 Z"
        fill="url(#capeGrad)"
        stroke="#14532D"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </g>

    {/* ===== 5. 羊咩咩主體 (Fluffy Sheep Body & Limbs) ===== */}
    <g id="sheep-body">
      {/* 圓滾滾羊身綿密白雲毛球群 */}
      <g fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="3" filter="url(#softShadow)">
        <circle cx="210" cy="340" r="48" />
        <circle cx="250" cy="350" r="52" />
        <circle cx="295" cy="345" r="46" />
        <circle cx="330" cy="325" r="38" />
        <circle cx="180" cy="315" r="42" />
        <circle cx="250" cy="310" r="55" />
      </g>

      {/* 可愛小羊尾巴 (右後) */}
      <circle cx="335" cy="340" r="14" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2.5" />

      {/* 邁步向前的深色羊蹄小腳腳 (Hooves) */}
      {/* 左腳邁步 */}
      <g transform="translate(195, 370) rotate(25)">
        <rect x="-8" y="0" width="18" height="24" rx="9" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2.5" />
        <rect x="-8" y="15" width="18" height="12" rx="6" fill="#475569" stroke="#1E293B" strokeWidth="2" />
      </g>
      {/* 右腳蹬地 */}
      <g transform="translate(325, 365) rotate(-35)">
        <rect x="-8" y="0" width="18" height="24" rx="9" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2.5" />
        <rect x="-8" y="15" width="18" height="12" rx="6" fill="#475569" stroke="#1E293B" strokeWidth="2" />
      </g>
      {/* 揮動的可愛前小蹄 */}
      <g transform="translate(250, 318) rotate(40)">
        <rect x="-7" y="0" width="15" height="20" rx="7.5" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2" />
        <rect x="-7" y="12" width="15" height="10" rx="5" fill="#475569" stroke="#1E293B" strokeWidth="1.5" />
      </g>
    </g>

    {/* ===== 6. 羊咩咩萌臉與神采大眼睛 (Kawaii Face & Big Anime Eyes) ===== */}
    <g id="sheep-head">
      {/* 頭部白雲絨毛圍繞圈 */}
      <g fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="3">
        <circle cx="170" cy="235" r="32" />
        <circle cx="210" cy="180" r="36" />
        <circle cx="260" cy="170" r="40" />
        <circle cx="310" cy="185" r="36" />
        <circle cx="340" cy="235" r="32" />
        <circle cx="315" cy="285" r="35" />
        <circle cx="190" cy="280" r="35" />
      </g>

      {/* 軟萌粉嫩垂耳 (Floppy Ears) */}
      {/* 左耳 */}
      <g transform="translate(155, 235) rotate(-22)">
        <ellipse cx="0" cy="0" rx="36" ry="18" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="3" />
        <ellipse cx="-2" cy="0" rx="26" ry="11" fill="#FDA4AF" opacity="0.8" />
      </g>
      {/* 右耳 */}
      <g transform="translate(335, 235) rotate(22)">
        <ellipse cx="0" cy="0" rx="36" ry="18" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="3" />
        <ellipse cx="2" cy="0" rx="26" ry="11" fill="#FDA4AF" opacity="0.8" />
      </g>

      {/* 羊臉中心主面龐 */}
      <ellipse cx="250" cy="245" rx="72" ry="62" fill="#FFFFFF" />

      {/* ===== 標誌性動漫水汪汪大眼睛 (Anime Sparkling Eyes) ===== */}
      {/* 左眼 */}
      <g transform="translate(205, 240)">
        <ellipse cx="0" cy="0" rx="19" ry="24" fill="#1E1B4B" stroke="#0F172A" strokeWidth="2" />
        {/* 眼中大光斑 */}
        <circle cx="-5" cy="-8" r="7.5" fill="#FFFFFF" />
        <circle cx="5" cy="10" r="3.5" fill="#FFFFFF" />
        {/* 眼中鑽石星光反射 */}
        <polygon points="-4,6 -1,8 -4,10 -7,8" fill="#FFFFFF" opacity="0.9" />
        <polygon points="6,-4 8,-2 6,0 4,-2" fill="#FFFFFF" opacity="0.8" />
        {/* 雙眼皮線條 */}
        <path d="M-16 -26 Q0 -34 16 -26" stroke="#475569" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>

      {/* 右眼 */}
      <g transform="translate(275, 240)">
        <ellipse cx="0" cy="0" rx="19" ry="24" fill="#1E1B4B" stroke="#0F172A" strokeWidth="2" />
        <circle cx="-5" cy="-8" r="7.5" fill="#FFFFFF" />
        <circle cx="5" cy="10" r="3.5" fill="#FFFFFF" />
        <polygon points="-4,6 -1,8 -4,10 -7,8" fill="#FFFFFF" opacity="0.9" />
        <polygon points="6,-4 8,-2 6,0 4,-2" fill="#FFFFFF" opacity="0.8" />
        <path d="M-16 -26 Q0 -34 16 -26" stroke="#475569" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>

      {/* 萌萌紅暈腮紅 (Blushing Cheeks) */}
      <ellipse cx="178" cy="265" rx="14" ry="9" fill="#FB7185" opacity="0.5" />
      <ellipse cx="302" cy="265" rx="14" ry="9" fill="#FB7185" opacity="0.5" />
      {/* 腮紅斜線 */}
      <line x1="172" y1="262" x2="178" y2="268" stroke="#F43F5E" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="178" y1="262" x2="184" y2="268" stroke="#F43F5E" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="296" y1="262" x2="302" y2="268" stroke="#F43F5E" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="302" y1="262" x2="308" y2="268" stroke="#F43F5E" strokeWidth="1.5" strokeLinecap="round" />

      {/* 可愛小鼻子與靦腆微笑 */}
      <path d="M245 255 Q250 258 255 255" stroke="#78350F" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M243 262 Q250 268 257 262" stroke="#78350F" strokeWidth="2.5" fill="none" strokeLinecap="round" />

      {/* 領口翠綠四葉草/蝴蝶領結 */}
      <g transform="translate(235, 305)">
        <circle cx="-6" cy="0" r="7" fill="#15803D" />
        <circle cx="6" cy="0" r="7" fill="#15803D" />
        <circle cx="0" cy="0" r="5" fill="#FDE047" stroke="#92400E" strokeWidth="1.5" />
      </g>
    </g>

    {/* ===== 7. 羊頭頂的黃金皇冠 (Golden Crown) ===== */}
    <g transform="translate(245, 142)">
      <polygon
        points="-32,0 -40,-26 -16,-12 0,-34 16,-12 40,-26 32,0"
        fill="url(#goldCoinGrad)"
        stroke="#92400E"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* 皇冠頂部五顆珍珠寶石 */}
      <circle cx="-40" cy="-26" r="3.5" fill="#FEF08A" stroke="#92400E" strokeWidth="1.5" />
      <circle cx="0" cy="-34" r="4.5" fill="#FEF08A" stroke="#92400E" strokeWidth="1.5" />
      <circle cx="40" cy="-26" r="3.5" fill="#FEF08A" stroke="#92400E" strokeWidth="1.5" />
    </g>

    {/* ===== 8. 胸前「資產上羊」金幟布旗 (The Mascot Banner) ===== */}
    <g id="banner" transform="translate(200, 345) rotate(-6)" filter="url(#softShadow)">
      {/* 緞帶旗幟主體 */}
      <path
        d="M -115 -25 L 125 -15 Q 115 25 105 32 L -95 40 Q -105 10 -115 -25 Z"
        fill="url(#bannerGrad)"
        stroke="#92400E"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* 旗幟內部刻紋 */}
      <text
        x="5"
        y="3"
        fontSize="21"
        fontWeight="900"
        fontFamily="sans-serif"
        fill="#451A03"
        textAnchor="middle"
        letterSpacing="2"
      >
        資產上羊
      </text>
      <text
        x="5"
        y="17"
        fontSize="8.5"
        fontWeight="800"
        fontFamily="sans-serif"
        fill="#78350F"
        textAnchor="middle"
        letterSpacing="0.8"
      >
        WEALTH UPWARD
      </text>
      <text
        x="5"
        y="28"
        fontSize="8.5"
        fontWeight="800"
        fontFamily="sans-serif"
        fill="#78350F"
        textAnchor="middle"
        letterSpacing="0.8"
      >
        ASSET GO UP!
      </text>
    </g>

    {/* ===== 9. 頭頂最上方「% 300%」綠色氣泡圖騰 (Top Growth Indicator) ===== */}
    <g transform="translate(250, 60)" filter="url(#softShadow)">
      {/* 綠色泡泡外框 */}
      <path
        d="M -60 -20 Q -70 -20 -70 -5 Q -70 10 -60 10 L 60 10 Q 70 10 70 -5 Q 70 -20 60 -20 Z"
        fill="#ECFDF5"
        stroke="#059640"
        strokeWidth="3.5"
      />
      {/* 標誌性 % 300% 文字 */}
      <text
        x="-38"
        y="2"
        fontSize="30"
        fontWeight="900"
        fontFamily="Arial Black, Impact, sans-serif"
        fill="#059640"
        stroke="#064E3B"
        strokeWidth="1.2"
        textAnchor="middle"
      >
        %
      </text>
      <text
        x="18"
        y="2"
        fontSize="24"
        fontWeight="900"
        fontFamily="Arial Black, Impact, sans-serif"
        fill="#059640"
        textAnchor="middle"
        letterSpacing="1"
      >
        300%
      </text>
    </g>
  </svg>
);

export const BearHelperMascot: React.FC<{ className?: string; size?: number }> = ({
  className = '',
  size = 32,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none ${className}`}
  >
    {/* Ears */}
    <circle cx="12" cy="12" r="5" fill="#B45309" />
    <circle cx="12" cy="12" r="2.5" fill="#FDE68A" />
    <circle cx="28" cy="12" r="5" fill="#B45309" />
    <circle cx="28" cy="12" r="2.5" fill="#FDE68A" />
    {/* Head */}
    <circle cx="20" cy="22" r="14" fill="#D97706" />
    {/* Snout */}
    <ellipse cx="20" cy="25" rx="6" ry="4.5" fill="#FEF3C7" />
    <ellipse cx="20" cy="23.5" rx="2.5" ry="1.8" fill="#78350F" />
    {/* Eyes */}
    <circle cx="15" cy="19" r="1.8" fill="#1E293B" />
    <circle cx="25" cy="19" r="1.8" fill="#1E293B" />
    {/* Cheeks */}
    <circle cx="13" cy="24" r="2" fill="#F43F5E" opacity="0.4" />
    <circle cx="27" cy="24" r="2" fill="#F43F5E" opacity="0.4" />
  </svg>
);

export const PiggyBankMascot: React.FC<{ className?: string; size?: number }> = ({
  className = '',
  size = 40,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 50 50"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none ${className}`}
  >
    {/* Body */}
    <ellipse cx="26" cy="28" rx="18" ry="14" fill="#FDA4AF" stroke="#F43F5E" strokeWidth="2" />
    {/* Ears */}
    <polygon points="14,16 19,10 22,17" fill="#FB7185" />
    {/* Coin Slot */}
    <rect x="22" y="15" width="8" height="2" rx="1" fill="#BE123C" />
    {/* Snout */}
    <ellipse cx="40" cy="28" rx="5" ry="4" fill="#F43F5E" />
    <circle cx="39" cy="28" r="1" fill="#881337" />
    <circle cx="42" cy="28" r="1" fill="#881337" />
    {/* Eye */}
    <circle cx="32" cy="23" r="1.5" fill="#1E293B" />
    {/* Legs */}
    <rect x="16" y="39" width="4" height="6" rx="2" fill="#FB7185" />
    <rect x="30" y="39" width="4" height="6" rx="2" fill="#FB7185" />
  </svg>
);

export const TravelTeamMascot: React.FC<{ className?: string; size?: number }> = ({
  className = '',
  size = 40,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 50 50"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none ${className}`}
  >
    {/* Suitcase */}
    <rect x="12" y="18" width="26" height="24" rx="4" fill="#0EA5E9" stroke="#0284C7" strokeWidth="2" />
    {/* Handle */}
    <path d="M20 18 V13 H30 V18" stroke="#0369A1" strokeWidth="2.5" fill="none" />
    {/* Stripes */}
    <line x1="12" y1="26" x2="38" y2="26" stroke="#BAE6FD" strokeWidth="1.5" />
    <line x1="12" y1="34" x2="38" y2="34" stroke="#BAE6FD" strokeWidth="1.5" />
    {/* Passport / Stamp icon */}
    <circle cx="25" cy="30" r="4" fill="#FBBF24" />
    {/* Wheels */}
    <circle cx="17" cy="43" r="2.5" fill="#334155" />
    <circle cx="33" cy="43" r="2.5" fill="#334155" />
  </svg>
);
