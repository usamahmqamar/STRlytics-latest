/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldCheck, Plus, Search, Filter, Trash2, 
  Download, Eye, FileText, Building2, Calendar,
  AlertCircle, CheckCircle2, Lock, Globe,
  FileWarning, HardDrive, Stamp, Clock, X
} from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { UserData, Document } from '../types';
import { format, parseISO, isBefore, addDays } from 'date-fns';
import { cn } from '../lib/utils';

interface DocumentsProps {
  data: UserData;
  setData: React.Dispatch<React.SetStateAction<UserData>>;
}

export const Documents: React.FC<DocumentsProps> = ({ data, setData }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [newDoc, setNewDoc] = useState<Partial<Document>>({
    type: 'title_deed',
    status: 'active',
    apartment_id: data.apartments[0]?.apartment_id || ''
  });

  const documentTypes = [
    { id: 'title_deed', name: 'Title Deed' },
    { id: 'tenancy_contract', name: 'Tenancy Contract' },
    { id: 'dtcm_permit', name: 'DTCM Permit' },
    { id: 'insurance', name: 'Insurance' },
    { id: 'utility_bill', name: 'Utility Bill' },
    { id: 'ejari', name: 'Ejari' },
    { id: 'noc', name: 'NOC' },
    { id: 'passport_visa', name: 'Passport/Visa' },
    { id: 'management_agreement', name: 'Management Agreement' }
  ];

  const handleUpload = () => {
    if (!newDoc.title || !newDoc.apartment_id || !newDoc.type) return;

    const doc: Document = {
      doc_id: `DOC-${Date.now()}`,
      title: newDoc.title,
      apartment_id: newDoc.apartment_id,
      type: newDoc.type,
      expiry_date: newDoc.expiry_date,
      status: newDoc.status as any || 'active',
      file_url: '#' // Placeholder
    };

    setData(prev => ({
      ...prev,
      documents: [...(prev.documents || []), doc]
    }));

    setIsUploadModalOpen(false);
    setNewDoc({
      type: 'title_deed',
      status: 'active',
      apartment_id: data.apartments[0]?.apartment_id || ''
    });
  };

  const handleDelete = (docId: string) => {
    if (window.confirm('Are you sure you want to delete this document?')) {
      setData(prev => ({
        ...prev,
        documents: (prev.documents || []).filter(d => d.doc_id !== docId)
      }));
    }
  };

  const filteredDocuments = useMemo(() => {
    return (data.documents || []).filter(doc => {
      const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || doc.type === typeFilter;
      const matchesProperty = propertyFilter === 'all' || doc.apartment_id === propertyFilter;
      return matchesSearch && matchesType && matchesProperty;
    });
  }, [data.documents, searchQuery, typeFilter, propertyFilter]);

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      case 'expired': return 'text-rose-600 bg-rose-50 border-rose-100';
      case 'pending_renewal': return 'text-orange-600 bg-orange-50 border-orange-100';
      default: return 'text-zinc-600 bg-zinc-50 border-zinc-100';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'title_deed': return <Building2 size={16} className="text-emerald-500" />;
      case 'dtcm_permit': return <ShieldCheck size={16} className="text-emerald-500" />;
      case 'insurance': return <Lock size={16} className="text-amber-500" />;
      case 'tenancy_contract': return <FileText size={16} className="text-blue-500" />;
      case 'ejari': return <Stamp size={16} className="text-emerald-500" />;
      default: return <FileText size={16} className="text-zinc-400" />;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Document Vault</h2>
          <p className="text-zinc-500 text-sm font-medium">Securely store and manage property permits and legal documents.</p>
        </div>
        <Button onClick={() => setIsUploadModalOpen(true)}>
          <Plus size={18} />
          Upload Document
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-emerald-50/50 border-emerald-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-xl text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-zinc-900">Active Permits</div>
              <div className="text-2xl font-black text-emerald-600">
                {(data.documents || []).filter(d => d.status === 'active').length}
              </div>
            </div>
          </div>
        </Card>
        <Card className="bg-orange-50/50 border-orange-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-xl text-orange-600">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-zinc-900">Pending Renewal</div>
              <div className="text-2xl font-black text-orange-600">
                {(data.documents || []).filter(d => d.status === 'pending_renewal').length}
              </div>
            </div>
          </div>
        </Card>
        <Card className="bg-rose-50/50 border-rose-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-100 rounded-xl text-rose-600">
              <FileWarning className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-zinc-900">Expired Documents</div>
              <div className="text-2xl font-black text-rose-600">
                {(data.documents || []).filter(d => d.status === 'expired').length}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input 
            type="text" 
            placeholder="Search documents..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <select 
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-white border border-zinc-200 rounded-xl px-4 py-2 text-sm font-bold text-zinc-700 focus:outline-none"
        >
          <option value="all">All Types</option>
          {documentTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select 
          value={propertyFilter}
          onChange={(e) => setPropertyFilter(e.target.value)}
          className="bg-white border border-zinc-200 rounded-xl px-4 py-2 text-sm font-bold text-zinc-700 focus:outline-none"
        >
          <option value="all">All Properties</option>
          {data.apartments.map(apt => (
            <option key={apt.apartment_id} value={apt.apartment_id}>{apt.name}</option>
          ))}
        </select>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100">
                <th className="p-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Document Title</th>
                <th className="p-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Property</th>
                <th className="p-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Type</th>
                <th className="p-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Expiry Date</th>
                <th className="p-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Status</th>
                <th className="p-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filteredDocuments.map((doc) => {
                const apt = data.apartments.find(a => a.apartment_id === doc.apartment_id);
                const isExpiringSoon = doc.expiry_date && isBefore(parseISO(doc.expiry_date), addDays(new Date(), 30));
                
                return (
                  <tr key={doc.doc_id} className="hover:bg-zinc-50/50 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-zinc-100 rounded-lg text-zinc-400 group-hover:text-emerald-500 transition-colors">
                          {getTypeIcon(doc.type)}
                        </div>
                        <span className="text-sm font-bold text-zinc-900">{doc.title}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-zinc-900">{apt?.name}</span>
                        <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-bold">{apt?.building}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                        {doc.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4">
                      {doc.expiry_date ? (
                        <div className="flex items-center gap-2">
                          <span className={cn("text-xs font-medium", isExpiringSoon ? "text-rose-500" : "text-zinc-900")}>
                            {format(parseISO(doc.expiry_date), 'MMM d, yyyy')}
                          </span>
                          {isExpiringSoon && <AlertCircle className="w-3 h-3 text-rose-500" />}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400 italic">No expiry</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border",
                        getStatusStyle(doc.status)
                      )}>
                        {doc.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1">
                        <button className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-900 transition-colors">
                          <Eye size={14} />
                        </button>
                        <button className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-900 transition-colors">
                          <Download size={14} />
                        </button>
                        <button 
                          onClick={() => handleDelete(doc.doc_id)}
                          className="p-2 hover:bg-rose-50 rounded-lg text-zinc-400 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredDocuments.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-20 text-center text-zinc-400 italic">
                    No documents found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <UploadModal 
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={handleUpload}
        newDoc={newDoc}
        setNewDoc={setNewDoc}
        apartments={data.apartments}
        documentTypes={documentTypes}
      />
    </div>
  );
};

const UploadModal = ({ 
  isOpen, 
  onClose, 
  onUpload, 
  newDoc, 
  setNewDoc, 
  apartments, 
  documentTypes 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onUpload: () => void, 
  newDoc: Partial<Document>, 
  setNewDoc: (doc: Partial<Document>) => void,
  apartments: any[],
  documentTypes: any[]
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
              <h3 className="text-lg font-black text-zinc-900 tracking-tight">Upload New Document</h3>
              <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Document Title</label>
                <input 
                  type="text" 
                  placeholder="e.g. Title Deed - MG1-2204"
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                  value={newDoc.title || ''}
                  onChange={e => setNewDoc({...newDoc, title: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Property</label>
                  <select 
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium appearance-none"
                    value={newDoc.apartment_id}
                    onChange={e => setNewDoc({...newDoc, apartment_id: e.target.value})}
                  >
                    {apartments.map(apt => (
                      <option key={apt.apartment_id} value={apt.apartment_id}>{apt.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Document Type</label>
                  <select 
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium appearance-none"
                    value={newDoc.type}
                    onChange={e => setNewDoc({...newDoc, type: e.target.value})}
                  >
                    {documentTypes.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Expiry Date (Optional)</label>
                  <input 
                    type="date" 
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                    value={newDoc.expiry_date || ''}
                    onChange={e => setNewDoc({...newDoc, expiry_date: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Initial Status</label>
                  <select 
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium appearance-none"
                    value={newDoc.status}
                    onChange={e => setNewDoc({...newDoc, status: e.target.value as any})}
                  >
                    <option value="active">Active</option>
                    <option value="pending_renewal">Pending Renewal</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>
              </div>

              <div className="pt-4">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setNewDoc({...newDoc, title: newDoc.title || file.name.split('.')[0]});
                    }
                  }}
                />
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-32 border-2 border-dashed border-zinc-200 rounded-2xl flex flex-col items-center justify-center gap-2 bg-zinc-50 hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  <HardDrive className="w-8 h-8 text-zinc-400" />
                  <p className="text-xs font-bold text-zinc-500">Click or drag to upload file</p>
                  <p className="text-[9px] text-zinc-400 uppercase font-black">PDF, JPG, PNG (Max 10MB)</p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={onUpload} disabled={!newDoc.title}>Upload Document</Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
