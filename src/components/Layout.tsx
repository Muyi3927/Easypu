import type { ReactNode } from 'react';
import './Layout.css';

interface LayoutProps {
  header: ReactNode;
  toolbar: ReactNode;
  editor: ReactNode;
  keyboard: ReactNode;
}

export const Layout = ({ header, toolbar, editor, keyboard }: LayoutProps) => {
  return (
    <div className="layout-container">
      <header className="layout-header hide-on-print">
        {header}
      </header>
      <div className="layout-toolbar hide-on-print">
        {toolbar}
      </div>
      <main className="layout-main">
        <div className="editor-wrapper">
          {editor}
        </div>
      </main>
      {keyboard && (
        <footer className="layout-footer hide-on-print">
          {keyboard}
        </footer>
      )}
    </div>
  );
};
