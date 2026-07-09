'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

interface SignatureCanvasProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
  saving?: boolean;
}

export function SignatureCanvas({ onSave, onCancel, saving }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas resolution for sharp rendering
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(2, 2);
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  const getPos = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      if ('touches' in e) {
        const touch = e.touches[0] || e.changedTouches[0];
        return {
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
        };
      }
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    [],
  );

  function startDrawing(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const pos = getPos(e);
    setIsDrawing(true);
    lastPos.current = pos;
    setHasSignature(true);

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!isDrawing) return;

    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !lastPos.current) return;

    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    lastPos.current = pos;
  }

  function stopDrawing() {
    setIsDrawing(false);
    lastPos.current = null;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasSignature(false);
  }

  function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md mx-auto overflow-hidden shadow-xl">
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-lg font-semibold text-gray-900">Customer Signature</h3>
          <p className="text-sm text-gray-500 mt-1">
            Please sign using your finger
          </p>
        </div>

        {/* Canvas */}
        <div className="px-5 pb-3">
          <div className="border-2 border-gray-300 rounded-xl overflow-hidden bg-white">
            <canvas
              ref={canvasRef}
              className="w-full h-40 touch-none"
              style={{ height: '160px' }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 space-y-3">
          <div className="flex gap-3">
            <button
              onClick={clearSignature}
              disabled={!hasSignature || saving}
              className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl text-base font-medium active:bg-gray-50 transition-colors disabled:opacity-40"
            >
              Clear
            </button>
            <button
              onClick={handleSave}
              disabled={!hasSignature || saving}
              className="flex-1 py-3 bg-brand-600 text-white rounded-xl text-base font-semibold shadow-sm active:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
          <button
            onClick={onCancel}
            disabled={saving}
            className="w-full py-3 text-gray-500 text-sm font-medium active:text-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

