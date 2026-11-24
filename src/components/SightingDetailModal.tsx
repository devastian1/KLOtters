import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { CheckCircle2, MapPin, MessageSquare, Send, Trash2, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Sighting, SightingComment, VALIDATION_LIMITS } from '../types';
import { formatCoordinates, formatRelativeTime } from '../utils/formatters';
import { ResilientImage } from './ResilientImage';

interface SightingDetailModalProps {
  sighting: Sighting | null;
  user: User | null;
  onClose: () => void;
  onCenterOnMap: (sighting: Sighting) => void;
  onSignIn: () => Promise<User | null>;
}

export function SightingDetailModal({
  sighting,
  user,
  onClose,
  onCenterOnMap,
  onSignIn,
}: SightingDetailModalProps) {
  const [comments, setComments] = useState<SightingComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setComments([]);
    setHasConfirmed(false);
    setConfirmDelete(false);
    setActionError(null);

    if (!sighting || sighting.isCuratedBaseline) return;

    const commentsPath = `sightings/${sighting.id}/comments`;
    const commentsQuery = query(
      collection(db, commentsPath),
      where('visibility', '==', 'public'),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      commentsQuery,
      (snapshot) => {
        const loaded: SightingComment[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const created = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now();
          return {
            id: docSnap.id,
            authorId: String(data.authorId || ''),
            authorName: String(data.authorName || 'Spotter'),
            text: String(data.text || ''),
            visibility: 'public',
            createdAtMs: created,
          };
        });
        loaded.sort((a, b) => a.createdAtMs - b.createdAtMs);
        setComments(loaded);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, commentsPath);
      }
    );

    return () => unsubscribe();
  }, [sighting]);

  useEffect(() => {
    if (!sighting || sighting.isCuratedBaseline || !user) {
      setHasConfirmed(false);
      return;
    }

    const confirmationRef = doc(db, `sightings/${sighting.id}/confirmations`, user.uid);
    getDoc(confirmationRef)
      .then((snap) => {
        setHasConfirmed(snap.exists());
      })
      .catch(() => {
        setHasConfirmed(false);
      });
  }, [sighting, user]);

  if (!sighting) return null;

  const isAuthor = Boolean(user && !sighting.isCuratedBaseline && user.uid === sighting.authorId);

  const handleConfirm = async () => {
    setActionError(null);
    if (sighting.isCuratedBaseline) {
      setActionError('Archive sightings are reference records. Publish or select a live community sighting to verify.');
      return;
    }

    let activeUser = user;
    if (!activeUser) {
      activeUser = await onSignIn();
      if (!activeUser) return;
    }

    if (hasConfirmed || isConfirming) return;
    setIsConfirming(true);

    const sightingRef = doc(db, 'sightings', sighting.id);
    const confirmationRef = doc(db, `sightings/${sighting.id}/confirmations`, activeUser.uid);
    const userName = (activeUser.displayName || activeUser.email?.split('@')[0] || 'KL Spotter').slice(
      0,
      VALIDATION_LIMITS.AUTHOR_NAME_MAX
    );

    try {
      const batch = writeBatch(db);
      batch.set(confirmationRef, {
        userId: activeUser.uid,
        userName,
        visibility: 'public',
        createdAt: serverTimestamp(),
      });
      batch.update(sightingRef, {
        confirmations: sighting.confirmations + 1,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setHasConfirmed(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `sightings/${sighting.id}/confirmations/${activeUser.uid}`);
    } finally {
      setIsConfirming(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    const trimmed = commentText.trim();
    if (!trimmed) return;

    if (sighting.isCuratedBaseline) {
      setActionError('Live notes are enabled on newly published community sightings.');
      return;
    }

    let activeUser = user;
    if (!activeUser) {
      activeUser = await onSignIn();
      if (!activeUser) return;
    }

    setIsPostingComment(true);
    const commentId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const authorName = (activeUser.displayName || activeUser.email?.split('@')[0] || 'KL Spotter').slice(
      0,
      VALIDATION_LIMITS.AUTHOR_NAME_MAX
    );

    try {
      await setDoc(doc(db, `sightings/${sighting.id}/comments`, commentId), {
        authorId: activeUser.uid,
        authorName,
        text: trimmed.slice(0, VALIDATION_LIMITS.COMMENT_MAX),
        visibility: 'public',
        createdAt: serverTimestamp(),
      });
      setCommentText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `sightings/${sighting.id}/comments/${commentId}`);
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleDeleteSighting = async () => {
    if (!isAuthor || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'sightings', sighting.id));
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `sightings/${sighting.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#141E1A]/65 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sighting-detail-title"
    >
      <div className="bg-white border border-[#D7E0D6] rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden shadow-2xl grid grid-cols-1 lg:grid-cols-[1.2fr_1fr]">
        {/* Left: High-res Photo Frame */}
        <div className="bg-[#101815] relative flex items-center justify-center min-h-[280px] lg:min-h-[520px]">
          <ResilientImage
            src={sighting.photoUrl}
            alt={sighting.title}
            className="w-full h-full max-h-[62vh] lg:max-h-[92vh] object-cover"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail"
            className="lg:hidden absolute top-3 right-3 w-10 h-10 rounded-lg bg-black/60 text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Right: Field Metadata + Live Notes */}
        <div className="flex flex-col max-h-[60vh] lg:max-h-[92vh] bg-white">
          <div className="px-5 py-4 border-b border-[#DCE3DA] flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs text-[#5D6D64]">
                {sighting.corridor} · {formatRelativeTime(sighting.createdAtMs)}
              </div>
              <h2 id="sighting-detail-title" className="font-display text-lg font-semibold text-[#141E1A] leading-snug">
                {sighting.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close sighting detail"
              className="hidden lg:flex w-9 h-9 rounded-lg items-center justify-center text-[#5D6D64] hover:text-[#141E1A] hover:bg-[#F3F6F3] shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 overflow-y-auto space-y-5 flex-1">
            {/* Clean Unboxed Key Facts */}
            <div className="grid grid-cols-2 gap-y-3 gap-x-4 pb-4 border-b border-[#EDF1EC] text-xs">
              <div>
                <div className="text-[#6B7B72]">Species</div>
                <div className="font-medium text-[#141E1A] mt-0.5">{sighting.species}</div>
              </div>
              <div>
                <div className="text-[#6B7B72]">Group & Activity</div>
                <div className="font-medium text-[#141E1A] mt-0.5 tabular-nums">
                  {sighting.count} {sighting.count === 1 ? 'otter' : 'otters'} · {sighting.activity}
                </div>
              </div>
              <div>
                <div className="text-[#6B7B72]">Location</div>
                <div className="font-medium text-[#141E1A] mt-0.5">{sighting.locationName}</div>
              </div>
              <div>
                <div className="text-[#6B7B72]">Coordinates</div>
                <div className="font-mono tabular-nums text-[#141E1A] mt-0.5">
                  {formatCoordinates(sighting.lat, sighting.lng)}
                </div>
              </div>
            </div>

            {sighting.notes && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-[#141E1A]">
                  Spotted by {sighting.authorName}
                </div>
                <p className="text-sm text-[#35443D] leading-relaxed">{sighting.notes}</p>
              </div>
            )}

            {/* Action Row */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={hasConfirmed || isConfirming}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                  hasConfirmed
                    ? 'bg-[#E9F4F0] border-[#B8D9CE] text-[#0D6E59]'
                    : 'bg-[#0D6E59] border-[#0D6E59] text-white hover:bg-[#095444]'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="tabular-nums">
                  {hasConfirmed ? 'Confirmed' : 'Confirm Sighting'} ({sighting.confirmations})
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onCenterOnMap(sighting);
                  onClose();
                }}
                className="px-3.5 py-2 text-xs font-medium bg-white border border-[#DCE3DA] text-[#141E1A] rounded-lg hover:bg-[#F3F6F3] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <MapPin className="w-3.5 h-3.5 text-[#0D6E59]" />
                <span>Show on Map</span>
              </button>

              {isAuthor && !confirmDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-2 text-xs font-medium text-[#8D261D] hover:bg-[#FDF1F0] rounded-lg transition-colors inline-flex items-center gap-1 ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )}

              {isAuthor && confirmDelete && (
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => void handleDeleteSighting()}
                    disabled={isDeleting}
                    className="px-3 py-1.5 text-xs font-medium bg-[#B42318] text-white rounded-lg"
                  >
                    {isDeleting ? 'Removing...' : 'Confirm Remove'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2 py-1.5 text-xs text-[#5D6D64]"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {actionError && (
              <p className="text-xs text-[#8C490F] bg-[#FDF4EB] border border-[#F2D5B8] rounded-lg px-3 py-2">
                {actionError}
              </p>
            )}

            {/* Live Field Notes */}
            <div className="pt-3 border-t border-[#EDF1EC] space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#141E1A]">
                <MessageSquare className="w-3.5 h-3.5 text-[#0D6E59]" />
                <span>Live Spotter Updates ({comments.length})</span>
              </div>

              {comments.length === 0 ? (
                <p className="text-xs text-[#6B7B72]">
                  {sighting.isCuratedBaseline
                    ? 'Reference sighting from KL Watch Archive.'
                    : 'No follow-up notes yet. Share if you see the raft moving downstream.'}
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {comments.map((comment) => (
                    <li
                      key={comment.id}
                      className="p-2.5 rounded-lg bg-[#F8F9F7] border border-[#EAEEE9] text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-[#5D6D64]">
                        <span className="font-semibold text-[#141E1A]">{comment.authorName}</span>
                        <span>{formatRelativeTime(comment.createdAtMs)}</span>
                      </div>
                      <p className="text-[#2D3B34] leading-relaxed">{comment.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Comment Composer */}
          {!sighting.isCuratedBaseline && (
            <form
              onSubmit={handlePostComment}
              className="p-3.5 border-t border-[#DCE3DA] bg-[#FBFDFB] flex items-center gap-2"
            >
              <input
                type="text"
                maxLength={VALIDATION_LIMITS.COMMENT_MAX}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={user ? 'Add movement update...' : 'Sign in to post an update...'}
                className="flex-1 h-9 px-3 text-xs bg-white border border-[#DCE3DA] rounded-lg focus:outline-none focus:border-[#0D6E59]"
              />
              <button
                type="submit"
                disabled={isPostingComment || !commentText.trim()}
                aria-label="Send update"
                className="h-9 px-3 bg-[#0D6E59] text-white rounded-lg hover:bg-[#095444] disabled:opacity-45 transition-colors inline-flex items-center gap-1.5 text-xs font-medium shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Post</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
