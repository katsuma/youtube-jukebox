import React, { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { extractYouTubeVideoId } from "../utils/youtube";
import { fetchYouTubeVideoInfo } from "../utils/youtube-api";
import { firebaseDB } from "../utils/firebase";

export interface PlaylistItem {
  id: string;
  url: string;
  videoId: string;
  title: string;
  thumbnail: string;
  addedAt: Date;
}

interface PlaylistContextType {
  queue: PlaylistItem[];
  addToQueue: (url: string) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;

  currentItem: PlaylistItem | null;
  playNext: () => void;
  updateCurrentItemInfo: (title: string) => void;

  history: PlaylistItem[];
  recentHistory: PlaylistItem[];
}

const PlaylistContext = createContext<PlaylistContextType | undefined>(undefined);

export function PlaylistProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<PlaylistItem[]>([]);
  const [currentItem, setCurrentItem] = useState<PlaylistItem | null>(null);
  const [history, setHistory] = useState<PlaylistItem[]>([]);

  const recentHistory = history.slice(0, 3);

  useEffect(() => {
    if (!firebaseDB.isInitialized()) {
      console.log('Firebase is not initialized. Using local state only.');
      return;
    }

    console.log('Setting up Firebase listeners...');

    try {
      const unsubscribeQueue = firebaseDB.onQueueChanged((items) => {
        setQueue(items);
      });

      const unsubscribeCurrent = firebaseDB.onCurrentItemChanged((item) => {
        setCurrentItem(item);
      });

      const unsubscribeHistory = firebaseDB.onHistoryChanged((items) => {
        setHistory(items);
      });

      return () => {
        console.log('Cleaning up Firebase listeners');
        unsubscribeQueue();
        unsubscribeCurrent();
        unsubscribeHistory();
      };
    } catch (error) {
      console.error('Error setting up Firebase listeners:', error);
      console.log('Falling back to local state management');
      return () => {};
    }
  }, []);

  const addToQueue = async (url: string) => {
    console.log('Adding to queue:', url);
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      console.error('Invalid YouTube URL, could not extract video ID:', url);
      return;
    }

    console.log('Extracted video ID:', videoId);

    const tempItem: PlaylistItem = {
      id: crypto.randomUUID(),
      url,
      videoId,
      title: `動画を読み込み中... (${videoId})`,
      thumbnail: `https://img.youtube.com/vi/${videoId}/default.jpg`,
      addedAt: new Date(),
    };

    try {
      console.log('Fetching video info for:', videoId);
      const videoInfo = await fetchYouTubeVideoInfo(videoId);
      console.log('Video info received:', videoInfo);

      const updatedItem = {
        ...tempItem,
        title: videoInfo.title,
        thumbnail: videoInfo.thumbnail
      };

      if (firebaseDB.isInitialized()) {
        try {
          console.log('Adding to Firebase queue:', updatedItem.title);
          await firebaseDB.addToQueue(updatedItem);
        } catch (error) {
          console.error('Firebase addToQueue failed, falling back to local state:', error);
          setQueue((prev) => [...prev, updatedItem]);
        }
      } else {
        console.log('Adding to local queue:', updatedItem.title);
        setQueue((prev) => [...prev, updatedItem]);
      }
    } catch (error) {
      console.error('動画情報の取得に失敗しました:', error);

      if (firebaseDB.isInitialized()) {
        try {
          console.log('Adding default item to Firebase queue');
          await firebaseDB.addToQueue(tempItem);
        } catch (firebaseError) {
          console.error('Firebase addToQueue failed, falling back to local state:', firebaseError);
          setQueue((prev) => [...prev, tempItem]);
        }
      } else {
        console.log('Adding default item to local queue');
        setQueue((prev) => [...prev, tempItem]);
      }
    }
  };

  const removeFromQueue = (id: string) => {
    if (firebaseDB.isInitialized()) {
      try {
        console.log('Removing from Firebase queue:', id);
        firebaseDB.removeFromQueue(id).catch(error => {
          console.error('Firebase removeFromQueue failed, falling back to local state:', error);
          setQueue((prev) => prev.filter((item) => item.id !== id));
        });
      } catch (error) {
        console.error('Error removing from queue:', error);
        setQueue((prev) => prev.filter((item) => item.id !== id));
      }
    } else {
      console.log('Removing from local queue:', id);
      setQueue((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const clearQueue = () => {
    if (firebaseDB.isInitialized()) {
      try {
        console.log('Clearing Firebase queue');
        firebaseDB.clearQueue().catch(error => {
          console.error('Firebase clearQueue failed, falling back to local state:', error);
          setQueue([]);
        });
      } catch (error) {
        console.error('Error clearing queue:', error);
        setQueue([]);
      }
    } else {
      console.log('Clearing local queue');
      setQueue([]);
    }
  };

  const playNext = () => {
    console.log('Playing next song');

    if (currentItem) {
      if (firebaseDB.isInitialized()) {
        try {
          console.log('Adding current item to Firebase history:', currentItem.title);
          firebaseDB.addToHistory(currentItem).catch(error => {
            console.error('Firebase addToHistory failed, falling back to local state:', error);
            setHistory((prev) => [currentItem, ...prev]);
          });
        } catch (error) {
          console.error('Error adding to history:', error);
          setHistory((prev) => [currentItem, ...prev]);
        }
      } else {
        console.log('Adding current item to local history:', currentItem.title);
        setHistory((prev) => [currentItem, ...prev]);
      }
    }

    if (queue.length > 0) {
      const nextItem = queue[0];
      console.log('Next item from queue:', nextItem.title);

      if (firebaseDB.isInitialized()) {
        try {
          console.log('Updating current item in Firebase:', nextItem.title);
          firebaseDB.updateCurrentItem(nextItem).catch(error => {
            console.error('Firebase updateCurrentItem failed, falling back to local state:', error);
            setCurrentItem(nextItem);
          });

          console.log('Removing item from Firebase queue:', nextItem.id);
          firebaseDB.removeFromQueue(nextItem.id).catch(error => {
            console.error('Firebase removeFromQueue failed, falling back to local state:', error);
            setQueue((prev) => prev.slice(1));
          });
        } catch (error) {
          console.error('Error updating current item:', error);
          setCurrentItem(nextItem);
          setQueue((prev) => prev.slice(1));
        }
      } else {
        console.log('Updating local current item and removing from queue');
        setCurrentItem(nextItem);
        setQueue((prev) => prev.slice(1));
      }
    } else {
      console.log('No items in queue, setting current item to null');
      if (firebaseDB.isInitialized()) {
        try {
          firebaseDB.updateCurrentItem(null).catch(error => {
            console.error('Firebase updateCurrentItem(null) failed, falling back to local state:', error);
            setCurrentItem(null);
          });
        } catch (error) {
          console.error('Error setting current item to null:', error);
          setCurrentItem(null);
        }
      } else {
        setCurrentItem(null);
      }
    }
  };

  const updateCurrentItemInfo = (title: string) => {
    if (currentItem) {
      console.log('Updating current item info:', title);
      const updatedItem = {
        ...currentItem,
        title: title || currentItem.title,
      };

      if (firebaseDB.isInitialized()) {
        try {
          console.log('Updating current item in Firebase with new title');
          firebaseDB.updateCurrentItem(updatedItem).catch(error => {
            console.error('Firebase updateCurrentItem failed, falling back to local state:', error);
            setCurrentItem(updatedItem);
          });
        } catch (error) {
          console.error('Error updating current item info:', error);
          setCurrentItem(updatedItem);
        }
      } else {
        console.log('Updating local current item with new title');
        setCurrentItem(updatedItem);
      }
    }
  };

  useEffect(() => {
    if (queue.length > 0 && !currentItem) {
      playNext();
    }
  }, [queue, currentItem]);

  const value = {
    queue,
    addToQueue,
    removeFromQueue,
    clearQueue,
    currentItem,
    playNext,
    updateCurrentItemInfo,
    history,
    recentHistory,
  };

  return (
    <PlaylistContext.Provider value={value}>
      {children}
    </PlaylistContext.Provider>
  );
}

export function usePlaylist() {
  const context = useContext(PlaylistContext);
  if (context === undefined) {
    throw new Error("usePlaylist must be used within a PlaylistProvider");
  }
  return context;
}
