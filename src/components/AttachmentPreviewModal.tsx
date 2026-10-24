import React from 'react';
import { isSafeInlineType } from '../utils/safeBlob';
import { Attachment } from '../types';
import { formatFileSize, formatToJalali } from '../utils/helpers';
import { X, Download, FileText, Image as ImageIcon, ExternalLink } from 'lucide-react';

interface AttachmentPreviewModalProps {
  attachment: Attachment | null;
  onClose: () => void;
}

export const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = ({
  attachment,
  onClose,
}) => {
  if (!attachment) return null;

  const isImage =
    attachment.type.startsWith('image/') || attachment.dataUrl.startsWith('data:image/');

  const handleDownload = () => {
    try {
      const dataUrl = attachment.dataUrl;
      if (!dataUrl) return;

      if (dataUrl.startsWith('data:')) {
        // Parse Base64 dataUrl into binary Blob
        const parts = dataUrl.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const blobUrl = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = attachment.name || 'file-attachment';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      } else {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = attachment.name || 'file-attachment';
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error('Error downloading attachment:', err);
      handleOpenInNewTab();
    }
  };

  const handleOpenInNewTab = () => {
    try {
      if (attachment.dataUrl.startsWith('data:')) {
        const parts = attachment.dataUrl.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        // Only a few types may be opened in a tab; the rest is saved instead of being run.
        const declared = mimeMatch ? mimeMatch[1] : '';
        const mime = isSafeInlineType(declared) ? declared : 'application/octet-stream';
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        if (mime === 'application/octet-stream') {
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = attachment.name || 'file';
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } else {
          window.open(blobUrl, '_blank', 'noopener,noreferrer');
        }
      } else if (attachment.dataUrl.startsWith('blob:')) {
        window.open(attachment.dataUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('Error opening attachment in new tab:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 my-auto">
        
        {/* Header - Top download button removed per user request */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 overflow-hidden">
            {isImage ? (
              <ImageIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            ) : (
              <FileText className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <div className="overflow-hidden">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                {attachment.name}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                حجم: {formatFileSize(attachment.size)} • تاریخ: {formatToJalali(attachment.createdAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              title="بستن"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 flex flex-col items-center justify-center max-h-[75vh] overflow-y-auto bg-slate-900/5 dark:bg-slate-950/40">
          {isImage ? (
            <div className="w-full flex flex-col items-center space-y-4">
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm max-h-[55vh] flex items-center justify-center p-2">
                <img
                  src={attachment.dataUrl}
                  alt={attachment.name}
                  className="max-h-[50vh] max-w-full object-contain rounded-xl"
                />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>دانلود مستقیم تصویر</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenInNewTab}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 active:scale-95 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>باز کردن در صفحه جدید</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 px-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs max-w-md w-full space-y-4">
              <FileText className="w-16 h-16 text-amber-500 dark:text-amber-400 mx-auto opacity-80" />
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">{attachment.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  حجم: {formatFileSize(attachment.size)}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>دانلود فایل ضمیمه</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenInNewTab}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 active:scale-95 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>باز کردن در پنجره جدید</span>
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

