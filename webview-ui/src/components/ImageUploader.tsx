import React, { useRef, useCallback } from 'react';

interface ImageUploaderProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  onReadyTrigger?: (trigger: () => void) => void;
}

// Compress image to reduce token count
function compressImage(base64: string, maxWidth: number = 800, maxHeight: number = 800, quality: number = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      
      // Calculate new dimensions
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      // Compress as JPEG with reduced quality
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = base64;
  });
}

export function ImageUploader({ images, onImagesChange, onReadyTrigger }: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    onReadyTrigger?.(() => fileInputRef.current?.click());
  }, [onReadyTrigger]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const newImages: string[] = [...images];
    const remaining = 3 - newImages.length; // Reduced from 4 to 3

    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, remaining);
    
    for (const file of imageFiles) {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          // Compress image to reduce size
          const compressed = await compressImage(base64, 800, 800, 0.7);
          newImages.push(compressed);
          onImagesChange([...newImages]);
        } catch (err) {
          console.error('Failed to compress image:', err);
          // Fall back to original if compression fails
          newImages.push(reader.result as string);
          onImagesChange([...newImages]);
        }
      };
      reader.readAsDataURL(file);
    }
  }, [images, onImagesChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      const dt = new DataTransfer();
      imageFiles.forEach(f => dt.items.add(f));
      handleFiles(dt.files);
    }
  }, [handleFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const removeImage = (index: number) => {
    const updated = images.filter((_, i) => i !== index);
    onImagesChange(updated);
  };

  return (
    <div onPaste={handlePaste}>
      {images.length > 0 && (
        <div className="flex gap-1.5 mb-2 flex-wrap">
          {images.map((img, i) => (
            <div
              key={i}
              className="relative w-14 h-14 rounded overflow-hidden group"
              style={{ border: '1px solid var(--vscode-panel-border)' }}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(i)}
                className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center text-[10px] rounded-bl opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  backgroundColor: 'var(--vscode-errorForeground, #f44)',
                  color: '#fff',
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {images.length < 4 && (
        <div
          className="flex items-center gap-2"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs px-2 py-1 rounded transition-opacity opacity-60 hover:opacity-100"
            style={{ background: 'var(--vscode-input-background)' }}
            title="Upload image"
          >
            📎 Image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <span className="text-[10px] opacity-40">
            Drop, paste, or click
          </span>
        </div>
      )}
    </div>
  );
}
