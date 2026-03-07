import { useState, useEffect } from 'react';
import { Search, LayoutGrid, Copy, Sparkles, Clock, ArrowRight } from 'lucide-react';
import { Button } from './ui/button';
import { SERVER_BASE } from '../utils/supabase/client';
import { toast } from 'sonner';

interface CommunityProject {
    projectId: string;
    slug: string;
    title: string;
    description: string;
    userName: string;
    publishedAt: string;
    thumbnailUrl: string;
    nodeCount: number;
    tokenCount: number;
    allowRemix: boolean;
}

interface CommunityPageProps {
    onBack: () => void;
    onSelectProject: (slug: string) => void;
    onRemixProject: (projectId: string) => void;
    isAuthenticated: boolean;
    onSignIn: () => void;
}

export function CommunityPage({ onBack, onSelectProject, onRemixProject, isAuthenticated, onSignIn }: CommunityPageProps) {
    const [projects, setProjects] = useState<CommunityProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        async function fetchCommunity() {
            try {
                const res = await fetch(`${SERVER_BASE}/community`);
                if (!res.ok) throw new Error('Failed to fetch community projects');
                const data = await res.json();
                setProjects(data.projects || []);
            } catch (err) {
                toast.error('Could not load community projects');
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        fetchCommunity();
    }, []);

    const filteredProjects = projects.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.userName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="h-screen bg-[#0a0a0a] text-white flex flex-col overflow-hidden">
            {/* Top Header */}
            <div className="shrink-0 h-16 border-b border-[#1a1a1a] flex items-center justify-between px-8 bg-[#0d0d0d]/80 backdrop-blur-md z-10">
                <div className="flex items-center gap-6">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-[#888] hover:text-white transition-colors group"
                    >
                        <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-0.5 transition-transform" />
                        <span className="text-[13px] font-medium">Dashboard</span>
                    </button>
                    <div className="h-4 w-px bg-[#222]" />
                    <h1 className="text-[15px] font-semibold text-[#e5e5e5] flex items-center gap-2">
                        <LayoutGrid className="w-4 h-4 text-[#4488ff]" />
                        Community
                    </h1>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555]" />
                        <input
                            type="text"
                            placeholder="Search projects by title or user..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-[280px] bg-[#141414] border border-[#222] rounded-full pl-9 pr-4 py-1.5 text-[13px] text-white placeholder-[#444] outline-none focus:border-[#333] transition-colors"
                        />
                    </div>
                    {!isAuthenticated && (
                        <Button
                            onClick={onSignIn}
                            variant="default"
                            className="bg-[#e5e5e5] text-black hover:bg-white h-8 text-[12px] px-4 rounded-full font-semibold"
                        >
                            Sign up to remix
                        </Button>
                    )}
                </div>
            </div>

            {/* Hero / Banner Area */}
            <div className="shrink-0 px-8 py-10 bg-gradient-to-b from-[#0d0d0d] to-[#0a0a0a] relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[600px] h-[300px] bg-[#4488ff]/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="max-w-[1200px] mx-auto relative z-10 text-center sm:text-left">
                    <h2 className="text-[32px] font-bold text-white tracking-tight mb-3">Explore Design Systems</h2>
                    <p className="text-[15px] text-[#888] max-w-[600px] leading-relaxed">
                        Discover, remix, and learn from design token architectures created by the community.
                        All projects are open for exploration.
                    </p>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-auto px-8 pb-20">
                <div className="max-w-[1200px] mx-auto">
                    {loading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 py-10">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} className="aspect-[1.5/1] bg-[#111] rounded-2xl animate-pulse border border-[#1a1a1a]" />
                            ))}
                        </div>
                    ) : filteredProjects.length === 0 ? (
                        <div className="py-40 text-center">
                            <LayoutGrid className="w-12 h-12 text-[#222] mx-auto mb-4" />
                            <p className="text-[#555] text-[15px]">No projects found matching your search.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12 py-6">
                            {filteredProjects.map((project) => (
                                <CommunityCard
                                    key={project.projectId}
                                    project={project}
                                    onSelect={() => onSelectProject(project.slug)}
                                    onRemix={() => onRemixProject(project.projectId)}
                                    isAuthenticated={isAuthenticated}
                                    onSignIn={onSignIn}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function CommunityCard({ project, onSelect, onRemix, isAuthenticated, onSignIn }: {
    project: CommunityProject;
    onSelect: () => void;
    onRemix: () => void;
    isAuthenticated: boolean;
    onSignIn: () => void;
}) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="group relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div
                onClick={onSelect}
                className="aspect-[1.5/1] rounded-2xl bg-[#111] border border-[#1e1e1e] overflow-hidden cursor-pointer relative transition-all duration-300 group-hover:border-[#333] group-hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] group-hover:-translate-y-1"
            >
                {/* Thumbnail or Fallback */}
                {project.thumbnailUrl ? (
                    <img
                        src={project.thumbnailUrl}
                        alt={project.title}
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = ''; // Clear source to show fallback
                        }}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#111] to-[#0a0a0a]">
                        <Sparkles className="w-8 h-8 text-[#222]" />
                    </div>
                )}

                {/* Floating Badges */}
                <div className="absolute top-4 left-4 flex gap-2">
                    <div className="px-2 py-1 rounded-md bg-black/60 backdrop-blur-md border border-white/5 text-[10px] font-medium text-white/80">
                        {project.tokenCount} tokens
                    </div>
                </div>

                {/* Hover Overlay Buttons */}
                <div className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center gap-3 transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                    <Button
                        onClick={(e) => { e.stopPropagation(); onSelect(); }}
                        className="bg-white text-black hover:bg-[#eee] h-8 text-[12px] px-4 rounded-full font-semibold"
                    >
                        Explore
                    </Button>
                    {project.allowRemix && (
                        <Button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isAuthenticated) onRemix();
                                else onSignIn();
                            }}
                            variant="outline"
                            className="bg-black/60 text-white border-white/20 hover:bg-black/80 h-8 text-[12px] px-4 rounded-full font-semibold backdrop-blur-md"
                        >
                            <Copy className="w-3.5 h-3.5 mr-1.5" />
                            Remix
                        </Button>
                    )}
                </div>
            </div>

            {/* Info Row */}
            <div className="mt-4 flex items-start justify-between px-1">
                <div>
                    <h3 className="text-[14px] font-semibold text-[#e5e5e5] group-hover:text-white transition-colors truncate max-w-[200px]">
                        {project.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#333] to-[#111] flex items-center justify-center text-[8px] border border-white/5">
                            {project.userName.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-[11px] text-[#666]">{project.userName}</span>
                    </div>
                </div>
                <div className="text-[11px] text-[#444] flex items-center gap-1.5 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {new Date(project.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
            </div>
        </div>
    );
}
