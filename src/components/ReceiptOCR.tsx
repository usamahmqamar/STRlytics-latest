/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Camera, Upload, X, Loader2, Sparkles, 
  CheckCircle2, AlertCircle, FileText, DollarSign,
  Calendar, Building2, User, Trash2
} from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { extractReceiptData } from '../services/gemini';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

interface ReceiptOCRProps {
  onSuccess: (data: any) => void;
}

export const ReceiptOCR: React.FC<ReceiptOCRProps> = ({ onSuccess }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setPreviewUrl(base64);
        processReceipt(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const processReceipt = async (base64: string) => {
    setIsProcessing(true);
    setError(null);
    try {
      const data = await extractReceiptData(base64);
      onSuccess(data);
      setPreviewUrl(null);
    } catch (err) {
      console.error("OCR Error:", err);
      setError("Failed to process receipt. Please try again or enter manually.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div 
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all",
          isProcessing ? "border-emerald-500/50 bg-emerald-50/50" : "border-zinc-200 hover:border-emerald-500/50 hover:bg-zinc-50"
        )}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept="image/*" 
          className="hidden" 
        />
        
        {isProcessing ? (
          <div className="text-center space-y-4">
            <div className="relative inline-block">
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
              <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-emerald-500 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900">AI Extracting Data...</h3>
              <p className="text-xs text-zinc-500">Gemini is analyzing your receipt</p>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <div className="p-4 bg-zinc-100 rounded-full text-emerald-600">
              <Camera className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900">Upload Receipt</h3>
              <p className="text-xs text-zinc-500">Take a photo or upload an image to auto-fill expense details</p>
            </div>
          </div>
        )}

        {previewUrl && (
          <div className="absolute inset-0 p-2 bg-white/80 backdrop-blur-sm rounded-3xl flex items-center justify-center">
            <img src={previewUrl} alt="Preview" className="max-h-full rounded-2xl shadow-lg" />
            {!isProcessing && (
              <button 
                onClick={(e) => { e.stopPropagation(); setPreviewUrl(null); }}
                className="absolute top-4 right-4 p-2 bg-zinc-900 text-white rounded-full hover:bg-zinc-800"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 text-rose-600 rounded-xl text-xs font-medium border border-rose-100">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 p-3 bg-zinc-50 rounded-xl text-[10px] uppercase tracking-widest font-bold text-zinc-400 border border-zinc-100">
        <Sparkles className="w-3 h-3 text-emerald-500" />
        Powered by Gemini AI OCR
      </div>
    </div>
  );
};
