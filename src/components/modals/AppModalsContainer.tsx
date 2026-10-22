import React from 'react';
import {
  User,
  Transaction,
  Ledger,
  AssetAccount,
  SinkingFund,
  HealthReport,
  Announcement,
  PendingBatch,
  TourStep,
  TourTopicId,
  UserTourProgress,
} from '../../types';
import { TransactionModal } from './TransactionModal';
import { TransferModal } from './TransferModal';
import { LedgerModal } from './LedgerModal';
import { CategoryModal } from './CategoryModal';
import { HealthReportModal } from './HealthReportModal';
import { UserProfileModal } from './UserProfileModal';
import { AssetModal } from './AssetModal';
import { SinkingFundModal } from './SinkingFundModal';
import { AccountMergeModal } from './AccountMergeModal';
import { AnnouncementModal } from './AnnouncementModal';
import { ReminderModal } from './ReminderModal';
import { BatchReviewModal } from './BatchReviewModal';
import { TourOverlay } from '../tour/TourOverlay';
import { TourHubModal } from '../tour/TourHubModal';
import { LineRealTourModal } from '../tour/LineRealTourModal';
import { MergeChoice } from '../../services/accountMergeService';

export interface AppModalsContainerProps {
  currentUser: User;
  finance: any;
  updateProfile: (name: string, avatarUrl: string) => Promise<void>;
  handleAiParse: (text: string) => Promise<any>;

  // Transaction Modal
  txModalOpen: boolean;
  setTxModalOpen: (open: boolean) => void;
  editingTx: Transaction | null;
  setEditingTx: (tx: Transaction | null) => void;

  // Transfer Modal
  transferModalOpen: boolean;
  setTransferModalOpen: (open: boolean) => void;

  // Ledger Modal
  ledgerModalOpen: boolean;
  setLedgerModalOpen: (open: boolean) => void;
  editingLedger: Ledger | null;
  setEditingLedger: (ledger: Ledger | null) => void;

  // Category Modal
  categoryModalOpen: boolean;
  setCategoryModalOpen: (open: boolean) => void;

  // Asset Modal
  assetModalOpen: boolean;
  setAssetModalOpen: (open: boolean) => void;
  editingAsset: AssetAccount | null;
  setEditingAsset: (asset: AssetAccount | null) => void;

  // Sinking Fund Modal
  sinkingModalOpen: boolean;
  setSinkingModalOpen: (open: boolean) => void;
  editingSinkingFund: SinkingFund | null;
  setEditingSinkingFund: (fund: SinkingFund | null) => void;
  defaultSinkingType: 'expense' | 'income';

  // Profile Modal
  profileModalOpen: boolean;
  setProfileModalOpen: (open: boolean) => void;

  // Health Report Modal
  healthModalReport: HealthReport | null;
  setHealthModalReport: (report: HealthReport | null) => void;

  // Merge Modal
  mergeModalData: any;
  setMergeModalData: (data: any) => void;
  handleExecuteMerge: (choice: MergeChoice) => Promise<void>;

  // Announcement Modal
  announcementModalOpen: boolean;
  setAnnouncementModalOpen: (open: boolean) => void;
  announcements: Announcement[];
  readAnnouncementIds: string[];
  handleMarkAnnouncementRead: (id: string) => void | Promise<void>;
  handleMarkAllAnnouncementsRead: () => void | Promise<void>;

  // Tour Modals
  currentTourStep: TourStep | null;
  activeTourTopicId: TourTopicId | null;
  setActiveTourTopicId: (id: TourTopicId | null) => void;
  setIsFullTourMode: (mode: boolean) => void;
  handleTourNext: () => void;
  handleTourPrev: () => void;
  handleTourAutoAction: (step: TourStep) => Promise<void> | void;
  isTourHubOpen: boolean;
  setIsTourHubOpen: (open: boolean) => void;
  tourProgress: UserTourProgress | null;
  handleStartTourTopic: (topicId: TourTopicId) => void;
  handleStartFullTour: () => void;
  handleResetTourProgress: () => void;
  isLineRealTourOpen: boolean;
  setIsLineRealTourOpen: (open: boolean) => void;
  loadTourProgress: () => void;

  // Reminder Modal
  reminderModalOpen: boolean;
  setReminderModalOpen: (open: boolean) => void;

  // Batch Modal
  batchModalOpen: boolean;
  setBatchModalOpen: (open: boolean) => void;
  batchModalId: string | null;
  refreshBatchDraft: () => Promise<void>;
  clearLocalDraft: (userId?: string) => void;
  setActiveBatchDraft: (draft: PendingBatch | null) => void;
}

export const AppModalsContainer: React.FC<AppModalsContainerProps> = ({
  currentUser,
  finance,
  updateProfile,
  handleAiParse,
  txModalOpen,
  setTxModalOpen,
  editingTx,
  setEditingTx,
  transferModalOpen,
  setTransferModalOpen,
  ledgerModalOpen,
  setLedgerModalOpen,
  editingLedger,
  setEditingLedger,
  categoryModalOpen,
  setCategoryModalOpen,
  assetModalOpen,
  setAssetModalOpen,
  editingAsset,
  setEditingAsset,
  sinkingModalOpen,
  setSinkingModalOpen,
  editingSinkingFund,
  setEditingSinkingFund,
  defaultSinkingType,
  profileModalOpen,
  setProfileModalOpen,
  healthModalReport,
  setHealthModalReport,
  mergeModalData,
  setMergeModalData,
  handleExecuteMerge,
  announcementModalOpen,
  setAnnouncementModalOpen,
  announcements,
  readAnnouncementIds,
  handleMarkAnnouncementRead,
  handleMarkAllAnnouncementsRead,
  currentTourStep,
  activeTourTopicId,
  setActiveTourTopicId,
  setIsFullTourMode,
  handleTourNext,
  handleTourPrev,
  handleTourAutoAction,
  isTourHubOpen,
  setIsTourHubOpen,
  tourProgress,
  handleStartTourTopic,
  handleStartFullTour,
  handleResetTourProgress,
  isLineRealTourOpen,
  setIsLineRealTourOpen,
  loadTourProgress,
  reminderModalOpen,
  setReminderModalOpen,
  batchModalOpen,
  setBatchModalOpen,
  batchModalId,
  refreshBatchDraft,
  clearLocalDraft,
  setActiveBatchDraft,
}) => {
  return (
    <>
      <TransactionModal
        isOpen={txModalOpen}
        onClose={() => {
          setTxModalOpen(false);
          setEditingTx(null);
        }}
        onSave={async (txData) => {
          if (editingTx) {
            await finance.updateTransaction(editingTx.id, txData);
          } else {
            await finance.addTransaction(txData);
          }
        }}
        initialData={editingTx}
        ledgers={finance.ledgers}
        assetAccounts={finance.assetAccounts}
        categories={finance.categories}
        friends={finance.friends}
        currentUserId={currentUser.id}
        currentUserName={currentUser.name}
        onAiParseText={handleAiParse}
      />

      <TransferModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        assetAccounts={finance.assetAccounts}
        ledgers={finance.ledgers}
        onTransfer={finance.transfer}
      />

      <LedgerModal
        isOpen={ledgerModalOpen}
        onClose={() => {
          setLedgerModalOpen(false);
          setEditingLedger(null);
        }}
        onSave={async (data) => {
          if (editingLedger) {
            await finance.updateLedger(editingLedger.id, data);
          } else {
            await finance.addLedger(data);
          }
        }}
        onDelete={finance.deleteLedger}
        initialData={editingLedger}
        friends={finance.friends}
        currentUserId={currentUser.id}
      />

      <CategoryModal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        categories={finance.categories}
        transactions={finance.transactions}
        onAddCategory={finance.addCategory}
        onUpdateCategory={finance.updateCategory}
        onDeleteCategory={finance.deleteCategory}
        onAiCleanDuplicates={finance.aiDeduplicateCategories}
        onTransactionsUpdated={finance.reloadData}
      />

      <AssetModal
        isOpen={assetModalOpen}
        onClose={() => {
          setAssetModalOpen(false);
          setEditingAsset(null);
        }}
        initialData={editingAsset}
        onSave={async (data) => {
          if (editingAsset) {
            await finance.updateAsset(editingAsset.id, data);
          } else {
            await finance.addAsset(data);
          }
        }}
      />

      <SinkingFundModal
        isOpen={sinkingModalOpen}
        onClose={() => {
          setSinkingModalOpen(false);
          setEditingSinkingFund(null);
        }}
        initialData={editingSinkingFund}
        defaultType={defaultSinkingType}
        categories={finance.categories}
        assetAccounts={finance.assetAccounts}
        ledgers={finance.ledgers}
        onSave={async (data) => {
          if (editingSinkingFund) {
            await finance.updateSinkingFund(editingSinkingFund.id, data);
          } else {
            await finance.addSinkingFund(data);
          }
        }}
      />

      <UserProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        currentUser={currentUser}
        onSave={updateProfile}
        onOpenMergeModal={setMergeModalData}
        onReloadUser={finance.reloadData}
      />

      <HealthReportModal
        isOpen={!!healthModalReport}
        onClose={() => setHealthModalReport(null)}
        report={healthModalReport}
      />

      {mergeModalData && (
        <AccountMergeModal
          isOpen={!!mergeModalData}
          onClose={() => setMergeModalData(null)}
          summary={mergeModalData}
          onExecuteMerge={handleExecuteMerge}
        />
      )}

      {currentUser && (
        <AnnouncementModal
          isOpen={announcementModalOpen}
          onClose={() => setAnnouncementModalOpen(false)}
          announcements={announcements}
          readIds={readAnnouncementIds}
          currentUser={currentUser}
          onMarkRead={handleMarkAnnouncementRead}
          onMarkAllRead={handleMarkAllAnnouncementsRead}
        />
      )}

      {/* 互動式新手導覽覆蓋聚光燈 */}
      <TourOverlay
        currentStep={currentTourStep}
        currentTopicId={activeTourTopicId}
        onNext={handleTourNext}
        onPrev={handleTourPrev}
        onClose={() => {
          setActiveTourTopicId(null);
          setIsFullTourMode(false);
        }}
        onAutoAction={handleTourAutoAction}
      />

      {/* 新手導覽學院中控台 Modal */}
      <TourHubModal
        isOpen={isTourHubOpen}
        onClose={() => setIsTourHubOpen(false)}
        progress={tourProgress || { userId: currentUser.id, completedTopics: [], isFullyCompleted: false, updatedAt: '' }}
        onStartTopic={handleStartTourTopic}
        onStartFullTour={handleStartFullTour}
        onResetProgress={handleResetTourProgress}
      />

      {/* LINE 官方機器人真實新手導覽 Modal */}
      {currentUser && (
        <LineRealTourModal
          isOpen={isLineRealTourOpen}
          onClose={() => setIsLineRealTourOpen(false)}
          currentUser={currentUser}
          onTourCompleted={() => {
            loadTourProgress();
            if (activeTourTopicId === 'line_bot') {
              handleTourNext();
            }
          }}
        />
      )}

      {/* 每日記帳提醒鬧鐘 Modal */}
      <ReminderModal
        isOpen={reminderModalOpen}
        onClose={() => setReminderModalOpen(false)}
        currentUser={currentUser}
      />

      {/* 批量記帳審核與微調 Modal */}
      <BatchReviewModal
        isOpen={batchModalOpen}
        batchId={batchModalId}
        onClose={() => {
          setBatchModalOpen(false);
          refreshBatchDraft();
        }}
        currentUser={currentUser}
        onSuccess={() => {
          clearLocalDraft(currentUser?.id);
          setActiveBatchDraft(null);
          finance.reloadData();
        }}
        onDraftSaved={(draft) => {
          setActiveBatchDraft(draft);
        }}
      />
    </>
  );
};
