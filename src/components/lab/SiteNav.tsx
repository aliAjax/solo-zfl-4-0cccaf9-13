import { NavLink } from 'react-router-dom';
import { Library, Wind, GitCompareArrows } from 'lucide-react';

export default function SiteNav() {
  const link = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border ${
      isActive
        ? 'bg-ochre-500 text-paper-50 border-ochre-500 shadow-paper'
        : 'bg-paper-50/70 text-ink-700 border-paper-300 hover:bg-paper-200'
    }`;

  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md bg-paper-100/80 border-b border-paper-300">
      <div className="container max-w-6xl flex items-center justify-between py-2.5">
        <NavLink to="/" className="font-hand text-xl text-ochre-600 flex items-center gap-2">
          <span className="text-2xl leading-none">🍃</span>
          旧房间气味记忆库
        </NavLink>
        <div className="flex items-center gap-2">
          <NavLink to="/" end className={link}>
            <Library className="w-4 h-4" />
            气味档案
          </NavLink>
          <NavLink to="/lab" className={link}>
            <Wind className="w-4 h-4" />
            扩散实验室
          </NavLink>
          <NavLink to="/lab/compare" className={link}>
            <GitCompareArrows className="w-4 h-4" />
            方案对比
          </NavLink>
        </div>
      </div>
    </nav>
  );
}
