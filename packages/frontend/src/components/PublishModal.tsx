import { useState, useCallback, useEffect } from 'react';
import { Globe, Loader2, Image as ImageIcon, Copy } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { toast } from 'sonner';

interface PublishModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPublish: (data: { title: string; description: string; allowRemix: boolean; thumbnailDataUrl?: string }) => Promise<void>;
    initialTitle?: string;
    isPublished?: boolean;
}

export function PublishModal({ isOpen, onClose, onPublish, initialTitle = '', isPublished = false }: PublishModalProps) {
    const [title, setTitle] = useState(initialTitle);
    const [description, setDescription] = useState('');
    const [allowRemix, setAllowRemix] = useState(true);
    const [loading, setLoading] = useState(false);
    const [thumbnail, setThumbnail] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (isOpen) {
            setTitle(initialTitle);
            // Capture thumbnail from canvas when modal opens
            captureThumbnail();
        }
    }, [isOpen, initialTitle]);

    const captureThumbnail = useCallback(() => {
        try {
            // Find the main canvas element dynamically
            const canvas = document.querySelector('canvas');
            if (canvas) {
                // Create a temporary canvas to resize/crop for the thumbnail
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = 450;
                tempCanvas.height = 300;
                const ctx = tempCanvas.getContext('2d');
                if (ctx) {
                    // Fill background
                    ctx.fillStyle = '#0a0a0a';
                    ctx.fillRect(0, 0, 450, 300);

                    // Draw a centered portion of the main canvas
                    // (Crude implementation: just scale it down)
                    ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
                    setThumbnail(tempCanvas.toDataURL('image/webp', 0.8));
                }
            }
        } catch (err) {
            console.warn('Thumbnail capture failed', err);
        }
    }, []);

    const handlePublish = async () => {
        if (title.length < 2) {
            toast.error('Title must be at least 2 characters');
            return;
        }
        setLoading(true);
        try {
            await onPublish({ title, description, allowRemix, thumbnailDataUrl: thumbnail });
            onClose();
        } catch (err: any) {
            toast.error(err.message || 'Publishing failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-[#111] border-[#1e1e1e] text-white max-w-[420px] p-0 overflow-hidden">
                <div className="p-6 pb-4">
                    <DialogHeader>
                        <DialogTitle className="text-[18px] font-semibold flex items-center gap-2">
                            <Globe className="w-5 h-5 text-[#4488ff]" />
                            {isPublished ? 'Update Published Project' : 'Publish to Community'}
                        </DialogTitle>
                        <DialogDescription className="text-[#666] text-[13px] mt-1">
                            Share your design token architecture with the community. Others will be able to view and explore your project.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="px-6 space-y-5">
                    {/* Thumbnail Preview */}
                    <div className="relative aspect-[1.5/1] rounded-xl bg-[#0a0a0a] border border-[#1a1a1a] overflow-hidden group">
                        {thumbnail ? (
                            <img src={thumbnail} alt="Preview" className="w-full h-full object-cover opacity-60" />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-[#222]">
                                <ImageIcon className="w-8 h-8 mb-2" />
                                <span className="text-[11px]">Capturing preview...</span>
                            </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-4">
                            <span className="text-[11px] font-medium text-white/40 uppercase tracking-widest">Project Preview</span>
                        </div>
                        <button
                            onClick={captureThumbnail}
                            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 text-white/60 hover:text-white hover:bg-black/60 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all border border-white/5"
                        >
                            <ImageIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[12px] font-medium text-[#444] ml-1">Title</label>
                            <Input
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="Name your project"
                                className="bg-[#0a0a0a] border-[#1e1e1e] focus:border-[#4488ff] transition-colors h-10 text-[13px]"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[12px] font-medium text-[#444] ml-1">Description (optional)</label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="What is this design system for?"
                                className="w-full min-h-[80px] bg-[#0a0a0a] border border-[#1e1e1e] rounded-md px-3 py-2 text-[13px] text-white placeholder-[#333] outline-none focus:border-[#4488ff] transition-colors resize-none"
                            />
                        </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between p-3 rounded-xl bg-[#0d0d0d] border border-[#1a1a1a]">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[#141414] flex items-center justify-center border border-[#1e1e1e]">
                                <Copy className="w-4 h-4 text-[#888]" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[13px] font-medium text-[#ccc]">Allow Remixing</span>
                                <span className="text-[10px] text-[#555]">Users can copy this to their dashboard</span>
                            </div>
                        </div>
                        <Switch
                            checked={allowRemix}
                            onCheckedChange={setAllowRemix}
                        />
                    </div>
                </div>

                <div className="p-6 bg-[#0d0d0d] mt-6 flex gap-3">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="flex-1 bg-transparent border-[#1e1e1e] text-[#666] hover:text-white hover:bg-[#1a1a1a]"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handlePublish}
                        disabled={loading}
                        className="flex-[2] bg-[#4488ff] hover:bg-[#5599ff] text-white font-semibold"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isPublished ? 'Update Listing' : 'Publish Project'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
