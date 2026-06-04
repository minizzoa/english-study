import { useState, useEffect, useRef, useCallback } from 'react';
import { WORDS } from '../data/wordData';
import {
  playCorrect, playCombo, playWrong, playTimeout,
  playGameOver, playLevelUp, playTick, isMuted, toggleMute,
} from '../utils/sound';
import './SpellQuiz.css';

const TOTAL_LIVES = 5;
const TIME_PER_Q  = 25;

/* ── 타일 생성 (알파벳 셔플) ──────────────────────────── */
function makeTiles(word) {
  const letters = word.en.toLowerCase().split('');
  let shuffled;
  let tries = 0;
  do {
    shuffled = [...letters].sort(() => Math.random() - 0.5);
    tries++;
  } while (tries < 8 && letters.length > 2 && shuffled.join('') === word.en.toLowerCase());
  return shuffled.map((letter, i) => ({ letter, id: i, used: false }));
}

/* ── 단어 랜덤 선택 ────────────────────────────────────── */
function pickWord(excludeEn = null) {
  const pool = excludeEn ? WORDS.filter(w => w.en !== excludeEn) : WORDS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ── 단어 길이별 타일 크기 ─────────────────────────────── */
function tileSize(len) {
  if (len <= 6)  return 46;
  if (len <= 9)  return 40;
  if (len <= 12) return 35;
  return 30;
}

export default function SpellQuiz({ onBack }) {
  const [phase,        setPhase]        = useState('splash');
  const [muted,        setMuted]        = useState(isMuted());
  const [currentWord,  setCurrentWord]  = useState(null);
  const [tiles,        setTiles]        = useState([]);
  const [slots,        setSlots]        = useState([]);     // null | { letter, hinted }
  const [wrongId,      setWrongId]      = useState(null);   // 흔들기 애니메이션용
  const [complete,     setComplete]     = useState(false);  // 단어 완성
  const [lives,        setLives]        = useState(TOTAL_LIVES);
  const [score,        setScore]        = useState(0);
  const [streak,       setStreak]       = useState(0);
  const [timeLeft,     setTimeLeft]     = useState(TIME_PER_Q);
  const [toast,        setToast]        = useState(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [total,        setTotal]        = useState(0);

  const strRef       = useRef(0);
  const scoreRef     = useRef(0);
  const livesRef     = useRef(TOTAL_LIVES);
  const activeRef    = useRef(false);
  const wordRef      = useRef(null);
  const timerRef     = useRef(null);
  const doTimeoutRef = useRef(null);

  wordRef.current = currentWord;

  /* ─── 다음 문제 로드 ─────────────────────── */
  const nextQuestion = useCallback((excludeEn = null) => {
    const w = pickWord(excludeEn);
    setCurrentWord(w);
    wordRef.current = w;
    setTiles(makeTiles(w));
    setSlots(Array(w.en.length).fill(null));
    setComplete(false);
    setTimeLeft(TIME_PER_Q);
    setTotal(t => t + 1);
  }, []);

  /* ─── 단어 완성 처리 ─────────────────────── */
  const handleComplete = useCallback(() => {
    setComplete(true);
    clearInterval(timerRef.current);

    const str = strRef.current + 1;
    strRef.current = str; setStreak(str);

    const pts = 20 + Math.floor(timeLeft * 0.8) + (str >= 3 ? Math.floor(str / 3) * 5 : 0);
    const newScore  = scoreRef.current + pts;
    const oldLv = Math.floor(scoreRef.current / 100) + 1;
    const newLv = Math.floor(newScore / 100) + 1;
    scoreRef.current = newScore; setScore(newScore);
    setCorrectCount(c => c + 1);

    if (newLv > oldLv) playLevelUp();
    else if (str >= 3)  playCombo();
    else                playCorrect();

    setToast({ text: `+${pts}${str >= 3 ? ` 🔥×${str}` : ''}`, type: 'correct', key: Date.now() });
    setTimeout(() => nextQuestion(wordRef.current?.en ?? null), 900);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, nextQuestion]);

  /* ─── 타일 탭 ────────────────────────────── */
  const handleTileTap = useCallback((tile) => {
    if (!activeRef.current || complete || tile.used) return;

    const nextIdx = slots.findIndex(s => s === null);
    if (nextIdx === -1) return;

    const correctLetter = currentWord.en.toLowerCase()[nextIdx];

    if (tile.letter === correctLetter) {
      // ✅ 정답 알파벳
      playTick();
      const newSlots = [...slots];
      newSlots[nextIdx] = { letter: tile.letter, hinted: false };
      setSlots(newSlots);
      setTiles(prev => prev.map(t => t.id === tile.id ? { ...t, used: true } : t));

      if (nextIdx === currentWord.en.length - 1) {
        // 마지막 글자 → 단어 완성
        handleComplete();
      }
    } else {
      // ❌ 틀린 알파벳
      playWrong();
      setWrongId(tile.id);
      setTimeout(() => setWrongId(null), 380);
      strRef.current = 0; setStreak(0);
      const newLives = livesRef.current - 1;
      livesRef.current = newLives; setLives(newLives);

      if (newLives <= 0) {
        activeRef.current = false;
        setTimeout(() => { playGameOver(); setPhase('over'); }, 500);
      }
    }
  }, [slots, currentWord, complete, handleComplete]);

  /* ─── 힌트 버튼 ──────────────────────────── */
  const handleHint = useCallback(() => {
    if (!activeRef.current || complete) return;
    const nextIdx = slots.findIndex(s => s === null);
    if (nextIdx === -1) return;

    const correctLetter = currentWord.en.toLowerCase()[nextIdx];
    const tile = tiles.find(t => !t.used && t.letter === correctLetter);
    if (!tile) return;

    // 점수 -5 (최소 0)
    const newScore = Math.max(0, scoreRef.current - 5);
    scoreRef.current = newScore; setScore(newScore);

    const newSlots = [...slots];
    newSlots[nextIdx] = { letter: correctLetter, hinted: true };
    setSlots(newSlots);
    setTiles(prev => prev.map(t => t.id === tile.id ? { ...t, used: true } : t));

    if (nextIdx === currentWord.en.length - 1) {
      handleComplete();
    }
  }, [slots, tiles, currentWord, complete, handleComplete]);

  /* ─── 타임아웃 (refs 사용) ───────────────── */
  doTimeoutRef.current = function doTimeout() {
    if (!activeRef.current) return;
    playTimeout();
    setComplete(true); // 타이머 멈춤
    strRef.current = 0; setStreak(0);
    const newLives = livesRef.current - 1;
    livesRef.current = newLives; setLives(newLives);

    const w = wordRef.current;
    setToast({ text: `⏱ 정답: ${w?.en ?? ''}`, type: 'timeout', key: Date.now() });

    if (newLives <= 0) {
      activeRef.current = false;
      setTimeout(() => { playGameOver(); setPhase('over'); }, 800);
    } else {
      setTimeout(() => nextQuestion(w?.en ?? null), 1400);
    }
  };

  /* ─── 타이머 ──────────────────────────────── */
  useEffect(() => {
    if (phase !== 'playing' || complete) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          doTimeoutRef.current?.();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWord, phase, complete]);

  /* ─── 시작 / 재시작 ─────────────────────── */
  const startGame = useCallback(() => {
    scoreRef.current = 0;           setScore(0);
    strRef.current   = 0;           setStreak(0);
    livesRef.current = TOTAL_LIVES; setLives(TOTAL_LIVES);
    setCorrectCount(0);
    setTotal(0);
    setToast(null);
    setComplete(false);
    activeRef.current = true;

    const w = pickWord();
    setCurrentWord(w);
    wordRef.current = w;
    setTiles(makeTiles(w));
    setSlots(Array(w.en.length).fill(null));
    setTimeLeft(TIME_PER_Q);
    setPhase('playing');
  }, []);

  const level      = Math.floor(score / 100) + 1;
  const timerPct   = (timeLeft / TIME_PER_Q) * 100;
  const timerDanger = timeLeft <= 6;
  const sz         = currentWord ? tileSize(currentWord.en.length) : 44;

  /* ─── 스플래시 ───────────────────────────── */
  if (phase === 'splash') return (
    <div className="sq-splash">
      <div className="sq-card">
        <div className="sq-splash-icon">🔤</div>
        <h1>스펠링 배열</h1>
        <p>한글 뜻을 보고 섞인 알파벳을<br />올바른 순서로 탭해서 완성하세요!</p>
        <ul className="sq-rules">
          <li>💡 한글 뜻이 힌트로 주어져요</li>
          <li>🔤 섞인 알파벳 타일을 순서대로 탭!</li>
          <li>❌ 틀린 알파벳 탭 → 생명 감소 (5개)</li>
          <li>💛 힌트 버튼 → 다음 글자 자동 입력 (-5점)</li>
          <li>⏱ 문제당 {TIME_PER_Q}초, 빠를수록 점수↑</li>
        </ul>
        <button className="sq-btn-primary" onClick={startGame}>시작하기</button>
        <button className="sq-btn-back" onClick={onBack}>← 뒤로</button>
      </div>
    </div>
  );

  /* ─── 게임 오버 ─────────────────────────── */
  if (phase === 'over') {
    const rank = score >= 300 ? '🏆 영어 마스터'
               : score >= 150 ? '🥇 영어 고수'
               : score >= 60  ? '🥈 영어 학생'
               :                '🥉 초보 탐험가';
    return (
      <div className="sq-splash">
        <div className="sq-card">
          <div className="sq-splash-icon">🎉</div>
          <h1>게임 오버!</h1>
          <div className="sq-rank">{rank}</div>
          <div className="sq-stats">
            <div className="sq-stat"><span>최종 점수</span><strong>{score}점</strong></div>
            <div className="sq-stat"><span>완성 단어</span><strong>{correctCount}개</strong></div>
          </div>
          <button className="sq-btn-primary" onClick={startGame}>다시 하기</button>
          <button className="sq-btn-back" onClick={() => setPhase('splash')}>← 뒤로</button>
        </div>
      </div>
    );
  }

  /* ─── 플레이 화면 ───────────────────────── */
  return (
    <div className="sq-game">

      {/* HUD */}
      <div className="sq-hud">
        <div className="sq-hud-score">
          <span className="sq-hud-val">{score}</span>
          <span className="sq-hud-lbl">점수</span>
        </div>
        <div className="sq-hud-mid">
          <span className="sq-badge-lv">Lv.{level}</span>
          {streak >= 3 && <span className="sq-badge-streak">🔥×{streak}</span>}
        </div>
        <div className="sq-hud-right">
          <div className="sq-hud-lives">
            {'❤️'.repeat(lives)}{'🖤'.repeat(Math.max(0, TOTAL_LIVES - lives))}
          </div>
          <div className="sq-hud-btns">
            <button className="sq-mute-btn" onClick={onBack} aria-label="홈으로">🏠</button>
            <button
              className="sq-mute-btn"
              onClick={() => setMuted(toggleMute())}
              aria-label={muted ? '소리 켜기' : '소리 끄기'}
            >{muted ? '🔇' : '🔊'}</button>
          </div>
        </div>
      </div>

      {/* 진행 카운터 */}
      <div className="sq-progress">
        <span className="sq-q-counter">문제 {total + 1}</span>
        <span className="sq-q-correct">✅ {correctCount}개 완성</span>
      </div>

      {/* 타이머 바 */}
      <div className="sq-timer-wrap">
        <div
          className={`sq-timer-bar${timerDanger ? ' sq-timer-danger' : ''}`}
          style={{ width: `${timerPct}%` }}
        />
      </div>

      {/* 한글 힌트 + 정답 슬롯 */}
      <div className="sq-question-area">
        <div className="sq-ko-hint">{currentWord?.ko}</div>

        {/* 정답 슬롯 */}
        <div className="sq-slots" style={{ '--sz': `${sz}px` }}>
          {slots.map((slot, i) => (
            <div
              key={i}
              className={`sq-slot${
                slot
                  ? slot.hinted
                    ? ' sq-slot-hinted'
                    : complete && i === slots.filter(s=>s).length - 1
                      ? ' sq-slot-last'
                      : ' sq-slot-filled'
                  : i === slots.findIndex(s => s === null)
                    ? ' sq-slot-active'
                    : ''
              }`}
            >
              {slot?.letter.toUpperCase() ?? ''}
            </div>
          ))}
        </div>

        {/* 완성 후 한글 뜻 강조 */}
        {complete && !slots.some(s => s === null) && (
          <div className="sq-word-complete">✓ {currentWord?.en}</div>
        )}
      </div>

      {/* 토스트 */}
      <div className="sq-toast-row">
        {toast && (
          <span key={toast.key} className={`sq-toast sq-toast-${toast.type}`}>
            {toast.text}
          </span>
        )}
      </div>

      {/* 알파벳 타일 */}
      <div className="sq-tiles-area">
        <div className="sq-tiles" style={{ '--sz': `${sz}px` }}>
          {tiles.map(tile => (
            <button
              key={tile.id}
              className={`sq-tile${tile.used ? ' sq-tile-used' : ''}${wrongId === tile.id ? ' sq-tile-wrong' : ''}`}
              onClick={() => handleTileTap(tile)}
              disabled={tile.used || complete}
            >
              {tile.letter.toUpperCase()}
            </button>
          ))}
        </div>

        {/* 힌트 버튼 */}
        <button
          className="sq-hint-btn"
          onClick={handleHint}
          disabled={complete || !activeRef.current}
        >
          💛 힌트 (-5점)
        </button>
      </div>

    </div>
  );
}
