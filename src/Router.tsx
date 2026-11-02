import { useEffect, useState } from 'react';
import App from './App';
import ReadOnlyPage from './ReadOnlyPage';

export default function Router() {
  const isReader = () => location.hash.split('?')[0] === '#/read-only';
  const [reader, setReader] = useState(isReader);
  useEffect(() => {
    const change = () => { setReader(isReader()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  return reader ? <ReadOnlyPage /> : <App />;
}
