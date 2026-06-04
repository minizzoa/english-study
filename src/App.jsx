import { useState } from 'react';
import FillBlank  from './games/FillBlank';
import WordSniper from './games/WordSniper';
import TypeQuiz   from './games/TypeQuiz';
import SpellQuiz  from './games/SpellQuiz';
import { WORDS }  from './data/wordData';
import './App.css';

/* ── 게임 선택 화면 ──────────────────────────────────── */
function GameSelector({ onSelect }) {
  return (
    <div className="gs-wrap">
      <div className="gs-header">
        <span className="gs-logo">📚</span>
        <h1>영어 단어 게임</h1>
        <p>플레이할 게임을 선택하세요</p>
      </div>
      <div className="gs-grid">
        <button className="gs-card" onClick={() => onSelect('fill')}>
          <span className="gs-card-icon">✏️</span>
          <span className="gs-card-title">빈칸 채우기</span>
          <span className="gs-card-desc">문장의 빈칸에 알맞은<br />영어 단어를 골라보세요</span>
        </button>
        <button className="gs-card" onClick={() => onSelect('sniper')}>
          <span className="gs-card-icon">🎯</span>
          <span className="gs-card-title">단어 스나이퍼</span>
          <span className="gs-card-desc">떠다니는 버블에서<br />올바른 영어 단어를 터뜨려요</span>
        </button>
        <button className="gs-card" onClick={() => onSelect('type')}>
          <span className="gs-card-icon">⌨️</span>
          <span className="gs-card-title">타이핑 퀴즈</span>
          <span className="gs-card-desc">단어를 직접 입력해서<br />영↔한 뜻을 맞춰보세요</span>
        </button>
        <button className="gs-card" onClick={() => onSelect('spell')}>
          <span className="gs-card-icon">🔤</span>
          <span className="gs-card-title">스펠링 배열</span>
          <span className="gs-card-desc">섞인 알파벳 타일을<br />순서대로 탭해서 완성!</span>
        </button>
      </div>
      <p className="gs-level-badge">🏫 중등 수준 · {WORDS.length.toLocaleString()}개 단어</p>
    </div>
  );
}

/* ── 메인 앱 ─────────────────────────────────────────── */
export default function App() {
  const [selectedGame, setSelectedGame] = useState(null);

  if (selectedGame === 'fill')   return <FillBlank  onBack={() => setSelectedGame(null)} />;
  if (selectedGame === 'sniper') return <WordSniper onBack={() => setSelectedGame(null)} />;
  if (selectedGame === 'type')   return <TypeQuiz   onBack={() => setSelectedGame(null)} />;
  if (selectedGame === 'spell')  return <SpellQuiz  onBack={() => setSelectedGame(null)} />;
  return <GameSelector onSelect={setSelectedGame} />;
}
