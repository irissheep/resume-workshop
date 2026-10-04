import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { DesktopAPI } from '../shared/schema';
import './styles.css';
declare global { interface Window { desktop: DesktopAPI } }
class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="fatal"><h1>界面遇到错误</h1><p>本地文件未被重置。请关闭并重新启动，检查草稿；必要时从备份恢复。</p></div> : this.props.children;
  }
}
createRoot(document.getElementById('root')!).render(<Boundary><App/></Boundary>);
