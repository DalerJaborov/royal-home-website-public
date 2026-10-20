import { useState, useRef, useCallback } from 'react';
import { X, ImageIcon, Check } from 'lucide-react';
import { trpc } from '@/providers/trpc';

interface FileUploadProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  accept?: string;
  maxSizeMB?: number;
}

// Compress image using canvas
export async function compressImage(file: File, maxWidth = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = (h * maxWidth) / w;
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('No canvas context')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Store image in localStorage with key
export function storeImage(key: string, dataUrl: string): string {
  localStorage.setItem(`img_${key}`, dataUrl);
  return `local:${key}`;
}

// Get stored image
export function getStoredImage(keyOrUrl: string): string {
  if (keyOrUrl.startsWith('local:')) {
    const key = keyOrUrl.replace('local:', '');
    return localStorage.getItem(`img_${key}`) || '';
  }
  return keyOrUrl;
}

export default function FileUpload({ value, onChange, label = 'Изображение', accept = 'image/*', maxSizeMB = 5 }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const processFile = useCallback(async (file: File) => {
    if (file.size > maxSizeMB * 1024 * 1024) {
      alert(`Файл слишком большой. Максимум ${maxSizeMB} МБ`);
      return;
    }
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const { url } = await utils.client.upload.create.mutate({ dataUrl: compressed });
      onChange(url);
    } catch {
      alert('Ошибка при загрузке изображения');
    }
    setUploading(false);
  }, [onChange, maxSizeMB, utils]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const displayUrl = getStoredImage(value);

  return (
    <div>
      <label className="text-xs text-gray-500 mb-1.5 block">{label}</label>
      {displayUrl ? (
        <div className="relative rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
          <img src={displayUrl} alt="" className="w-full h-40 object-contain" />
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={`Удалить изображение${label ? `: ${label}` : ''}`}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          {value.startsWith('local:') && (
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1">
              <Check className="w-3 h-3" /> Сжато
            </div>
          )}
        </div>
      ) : (
        // Зона загрузки доступна с клавиатуры: раньше это был div с onClick —
        // мышью работало, а табом до неё было не дойти и выбрать файл нечем.
        <div
          role="button"
          tabIndex={0}
          aria-label={`Загрузить изображение${label ? `: ${label}` : ''}`}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl h-40 flex flex-col items-center justify-center cursor-pointer transition-all ${
            dragOver ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
          }`}
        >
          {uploading ? (
            <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <ImageIcon className="w-8 h-8 text-gray-300 mb-2" />
              <span className="text-sm text-gray-400">Нажмите или перетащите фото</span>
              <span className="text-[10px] text-gray-300 mt-1">JPEG, PNG до {maxSizeMB} МБ</span>
            </>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
}
