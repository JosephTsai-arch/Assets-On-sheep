import React, { useState } from 'react';
import { SheepPost } from '../../types';
import { Send, Heart, Trash2 } from 'lucide-react';
import { InlineConfirm } from '../common/InlineConfirm';

interface SheepWallProps {
  sheepPosts: SheepPost[];
  currentUserId: string;
  onCreatePost: (content: string) => Promise<void>;
  onDeletePost: (postId: string) => Promise<void>;
  onToggleLike: (postId: string) => Promise<any>;
}

export const SheepWall: React.FC<SheepWallProps> = ({
  sheepPosts,
  currentUserId,
  onCreatePost,
  onDeletePost,
  onToggleLike,
}) => {
  const [postInput, setPostInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postInput.trim()) return;
    setIsSubmitting(true);
    try {
      await onCreatePost(postInput.trim());
      setPostInput('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activePosts = sheepPosts.filter((p) => !p.deletedAt);

  return (
    <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
          <span>🐑 羊咩咩好友心得牆</span>
        </h3>
        <span className="text-[11px] text-stone-400">社群互勉・一起存下第一桶金</span>
      </div>

      {/* 發文框 */}
      <form onSubmit={handlePostSubmit} className="flex gap-2">
        <input
          type="text"
          lang="zh-TW"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          value={postInput}
          onChange={(e) => setPostInput(e.target.value)}
          placeholder="分享今天的省錢心得或出遊趣事..."
          className="flex-1 px-3 py-2 border border-stone-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!postInput.trim() || isSubmitting}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
        >
          <Send size={14} />
          <span>{isSubmitting ? '發布中...' : '發布'}</span>
        </button>
      </form>

      {/* 心得貼文列表 */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {activePosts.length === 0 ? (
          <div className="py-8 text-center text-xs text-stone-400 bg-stone-50 rounded-2xl border border-stone-100">
            目前尚無心得分享，快來搶頭香發布第一則貼文吧！✨
          </div>
        ) : (
          activePosts.map((post) => {
            const isLiked = post.likedUserIds?.includes(currentUserId);
            // 判斷是否為本人發布的貼文 (author_id === current_user.id)
            const isMyPost = post.userId === currentUserId;

            return (
              <div
                key={post.id}
                className="p-3.5 bg-stone-50 border border-stone-200/60 rounded-2xl space-y-2 group transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <img
                      src={
                        post.authorAvatar ||
                        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'
                      }
                      alt={post.authorName}
                      className="w-7 h-7 rounded-full object-cover shrink-0"
                    />
                    <span className="text-xs font-bold text-stone-800 truncate" title={post.authorName}>{post.authorName}</span>
                    {isMyPost && (
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.2 rounded shrink-0">
                        我
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-stone-400">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </span>
                    {/* 本人貼文顯示 🗑️ 刪除按鈕 (雙重確認 + 軟刪除) */}
                    {isMyPost && (
                      <InlineConfirm
                        onConfirm={() => onDeletePost(post.id)}
                        title="確定軟刪除此貼文？"
                      />
                    )}
                  </div>
                </div>

                <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-wrap break-words">{post.content}</p>

                <div className="flex items-center justify-end">
                  <button
                    onClick={() => onToggleLike(post.id)}
                    className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition-all cursor-pointer ${
                      isLiked ? 'text-rose-600 bg-rose-50' : 'text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />
                    <span>{post.likesCount || 0}</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
