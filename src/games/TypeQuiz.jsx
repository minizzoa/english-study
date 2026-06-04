import { useState, useEffect, useRef, useCallback } from 'react';
import { WORDS } from '../data/wordData';
import {
  playCorrect, playCombo, playWrong, playTimeout,
  playGameOver, playLevelUp, isMuted, toggleMute,
} from '../utils/sound';
import './TypeQuiz.css';

const TOTAL_LIVES = 5;
const TIME_PER_Q  = 20;

function pickWord(excludeEn = null) {
  const pool = excludeEn ? WORDS.filter(w => w.en !== excludeEn) : WORDS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function checkAnswer(input, word, mode) {
  const norm = s => s.trim().replace(/\s+/g, '').toLowerCase();
  if (mode === 'enko') {
    // 영→한: 슬래시로 된 복수 정답 허용 (예: '쌀/밥')
    return word.ko.split('/').map(norm).some(a => a === norm(input));
  }
  return norm(input) === norm(word.en);
}

export default function TypeQuiz({ onBack }) {
  const [phase,        setPhase]        = useState('splash');
  const [mode,         setMode]         = useState(null);      // 'enko' | 'koen'
  const [muted,        setMuted]        = useState(isMuted());
  const [currentWord,  setCurrentWord]  = useState(null);
  const [input,        setInput]        = useState('');
  const [lives,        setLives]        = useState(TOTAL_LIVES);
  const [score,        setScore]        = useState(0);
  const [streak,       setStreak]       = useState(0);
  const [timeLeft,     setTimeLeft]     = useState(TIME_PER_Q);
  const [toast,        setToast]        = useState(null);
  const [answerStatus, setAnswerStatus] = useState(null); // 'correct'|'wrong'|'timeout'
  const [correctCount, setCorrectCount] = useState(0);
  const [total,        setTotal]        = useState(0);

  const strRef         = useRef(0);
  const scoreRef       = useRef(0);
  const livesRef       = useRef(TOTAL_LIVES);
  const activeRef      = useRef(false);
  const modeRef        = useRef(null);
  const wordRef        = useRef(null);
  const timerRef       = useRef(null);
  const inputRef       = useRef(null);
  const doTimeoutRef   = useRef(null);   // stale-closure 방지용

  // refs 동기화
  wordRef.current = currentWord;
  modeRef.current = mode;

  /* ─── 다음 문제 ──────────────────────────── */
  const nextQuestion = useCallback((excludeEn = null) => {
    const w = pickWord(excludeEn);
    setCurrentWord(w);
    setInput('');
    setAnswerStatus(null);
    setTimeLeft(TIME_PER_Q);
    setTotal(t => t + 1);
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  /* ─── 타임아웃 처리 (refs만 사용 → stale closure 없음) */
  doTimeoutRef.current = function doTimeout() {
    if (!activeRef.current) return;
    playTimeout();
    strRef.current = 0; setStreak(0);
    const newLives = livesRef.current - 1;
    livesRef.current = newLives; setLives(newLives);

    const w = wordRef.current;
    const answer = modeRef.current === 'enko' ? (w?.ko ?? '') : (w?.en ?? '');
    setAnswerStatus('timeout');
    setToast({ text: `⏱ 정답: ${answer}`, type: 'timeout', key: Date.now() });

    if (newLives <= 0) {
      activeRef.current = false;
      setTimeout(() => { playGameOver(); setPhase('over'); }, 800);
    } else {
      setTimeout(() => nextQuestion(w?.en ?? null), 1200);
    }
  };

  /* ─── 타이머 ──────────────────────────────── */
  useEffect(() => {
    if (phase !== 'playing' || answerStatus) return;
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
  }, [currentWord, phase, answerStatus]);

  /* ─── 정답 제출 ──────────────────────────── */
  const handleSubmit = useCallback(() => {
    if (!activeRef.current || answerStatus || !currentWord || input.trim() === '') return;
    clearInterval(timerRef.current);

    if (checkAnswer(input, currentWord, mode)) {
      // ✅ 정답
      const str = strRef.current + 1;
      strRef.current = str; setStreak(str);
      const pts = 10 + (str >= 3 ? Math.floor(str / 3) * 5 : 0) + Math.floor(timeLeft * 0.5);
      const newScore = scoreRef.current + pts;
      const oldLv = Math.floor(scoreRef.current / 100) + 1;
      const newLv = Math.floor(newScore / 100) + 1;
      scoreRef.current = newScore; setScore(newScore);
      setCorrectCount(c => c + 1);

      if (newLv > oldLv) playLevelUp();
      else if (str >= 3)  playCombo();
      else                playCorrect();

      setAnswerStatus('correct');
      setToast({ text: `+${pts}${str >= 3 ? ` 🔥×${str}` : ''}`, type: 'correct', key: Date.now() });
      setTimeout(() => nextQuestion(currentWord.en), 700);

    } else {
      // ❌ 오답
      playWrong();
      strRef.current = 0; setStreak(0);
      const newLives = livesRef.current - 1;
      livesRef.current = newLives; setLives(newLives);
      const answer = mode === 'enko' ? currentWord.ko : currentWord.en;
      setAnswerStatus('wrong');
      setToast({ text: `정답: ${answer}`, type: 'wrong', key: Date.now() });

      if (newLives <= 0) {
        activeRef.current = false;
        setTimeout(() => { playGameOver(); setPhase('over'); }, 800);
      } else {
        setTimeout(() => nextQuestion(currentWord.en), 1200);
      }
    }
  }, [input, currentWord, mode, answerStatus, timeLeft, nextQuestion]);

  /* ─── 시작 / 재시작 ─────────────────────── */
  const startGame = useCallback((selectedMode) => {
    scoreRef.current = 0;           setScore(0);
    strRef.current   = 0;           setStreak(0);
    livesRef.current = TOTAL_LIVES; setLives(TOTAL_LIVES);
    setCorrectCount(0);
    setTotal(0);
    setToast(null);
    setAnswerStatus(null);
    setInput('');
    setMode(selectedMode);
    modeRef.current = selectedMode;
    activeRef.current = true;

    const w = pickWord();
    setCurrentWord(w);
    wordRef.current = w;
    setTimeLeft(TIME_PER_Q);
    setPhase('playing');
    setTimeout(() => inputRef.current?.focus(), 120);
  }, []);

  const level      = Math.floor(score / 100) + 1;
  const timerPct   = (timeLeft / TIME_PER_Q) * 100;
  const timerDanger = timeLeft <= 5;
  const questionText = currentWord ? (mode === 'enko' ? currentWord.en : currentWord.ko) : '';
  const placeholder  = mode === 'koen' ? '영어로 입력...' : '한글로 입력...';

  /* ─── 스플래시 ───────────────────────────── */
  if (phase === 'splash') return (
    <div className="tq-splash">
      <div className="tq-card">
        <div className="tq-splash-icon">⌨️</div>
        <h1>타이핑 퀴즈</h1>
        <p>단어를 보고 직접 입력해서<br />정답을 맞춰보세요!</p>
        <ul className="tq-rules">
          <li>🔤 영→한: 영어 단어 보고 한글 뜻 입력</li>
          <li>🔡 한→영: 한글 뜻 보고 영어 단어 입력</li>
          <li>⏱ 문제당 {TIME_PER_Q}초, 빠를수록 점수↑</li>
          <li>⌨️ Enter 또는 확인 버튼으로 제출</li>
          <li>❤️ 오답/타임아웃시 생명 감소 (5개)</li>
        </ul>
        <p className="tq-mode-label">모드를 선택하면 바로 시작!</p>
        <div className="tq-mode-btns">
          <button className="tq-mode-btn tq-mode-enko" onClick={() => startGame('enko')}>
            <span className="tq-mode-icon">🔤</span>
            <span className="tq-mode-title">영 → 한</span>
            <span className="tq-mode-sub">영어 → 한글 입력</span>
          </button>
          <button className="tq-mode-btn tq-mode-koen" onClick={() => startGame('koen')}>
            <span className="tq-mode-icon">🔡</span>
            <span className="tq-mode-title">한 → 영</span>
            <span className="tq-mode-sub">한글 → 영어 입력</span>
          </button>
        </div>
        <button className="tq-btn-back" onClick={onBack}>← 뒤로</button>
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
      <div className="tq-splash">
        <div className="tq-card">
          <div className="tq-splash-icon">🎉</div>
          <h1>게임 오버!</h1>
          <div className="tq-rank">{rank}</div>
          <div className="tq-stats">
            <div className="tq-stat"><span>최종 점수</span><strong>{score}점</strong></div>
            <div className="tq-stat"><span>정답 수</span><strong>{correctCount}개</strong></div>
          </div>
          <p className="tq-mode-label">다시 도전!</p>
          <div className="tq-mode-btns">
            <button className="tq-mode-btn tq-mode-enko" onClick={() => startGame('enko')}>
              <span className="tq-mode-title">영 → 한</span>
            </button>
            <button className="tq-mode-btn tq-mode-koen" onClick={() => startGame('koen')}>
              <span className="tq-mode-title">한 → 영</span>
            </button>
          </div>
          <button className="tq-btn-back" onClick={onBack}>← 메뉴</button>
        </div>
      </div>
    );
  }

  /* ─── 플레이 화면 ───────────────────────── */
  return (
    <div className="tq-game">

      {/* HUD */}
      <div className="tq-hud">
        <div className="tq-hud-score">
          <span className="tq-hud-val">{score}</span>
          <span className="tq-hud-lbl">점수</span>
        </div>
        <div className="tq-hud-mid">
          <span className="tq-badge-lv">Lv.{level}</span>
          {streak >= 3 && <span className="tq-badge-streak">🔥×{streak}</span>}
          <span className={`tq-badge-mode${mode === 'koen' ? ' tq-badge-koen' : ' tq-badge-enko'}`}>
            {mode === 'enko' ? '영→한' : '한→영'}
          </span>
        </div>
        <div className="tq-hud-right">
          <div className="tq-hud-lives">
            {'❤️'.repeat(lives)}{'🖤'.repeat(Math.max(0, TOTAL_LIVES - lives))}
          </div>
          <div className="tq-hud-btns">
            <button className="tq-mute-btn" onClick={onBack} aria-label="홈으로">🏠</button>
            <button
              className="tq-mute-btn"
              onClick={() => setMuted(toggleMute())}
              aria-label={muted ? '소리 켜기' : '소리 끄기'}
            >{muted ? '🔇' : '🔊'}</button>
          </div>
        </div>
      </div>

      {/* 진행 카운터 */}
      <div className="tq-progress">
        <span className="tq-q-counter">문제 {total + 1}</span>
        <span className="tq-q-correct">✅ {correctCount}개 정답</span>
      </div>

      {/* 타이머 바 */}
      <div className="tq-timer-wrap">
        <div
          className={`tq-timer-bar${timerDanger ? ' tq-timer-danger' : ''}`}
          style={{ width: `${timerPct}%` }}
        />
      </div>

      {/* 문제 카드 */}
      <div className="tq-question-area">
        <div className="tq-mode-tag">
          {mode === 'enko' ? '이 영어 단어의 한글 뜻은?' : '이 한글 뜻의 영어 단어는?'}
        </div>
        <div className={`tq-question-word${answerStatus ? ` tq-word-${answerStatus}` : ''}`}>
          {questionText}
        </div>
        {(answerStatus === 'wrong' || answerStatus === 'timeout') && (
          <div className="tq-answer-reveal">
            ✓ {mode === 'enko' ? currentWord?.ko : currentWord?.en}
          </div>
        )}
        {answerStatus === 'correct' && (
          <div className="tq-answer-correct">✓ 정답!</div>
        )}
      </div>

      {/* 토스트 */}
      <div className="tq-toast-row">
        {toast && (
          <span key={toast.key} className={`tq-toast tq-toast-${toast.type}`}>
            {toast.text}
          </span>
        )}
      </div>

      {/* 입력창 */}
      <div className="tq-input-area">
        <div className={`tq-input-wrap${
          answerStatus === 'correct' ? ' tq-wrap-correct'
          : answerStatus ? ' tq-wrap-wrong' : ''
        }`}>
          <input
            ref={inputRef}
            className="tq-input"
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder={placeholder}
            disabled={!!answerStatus}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck="false"
          />
          <button
            className="tq-submit-btn"
            onClick={handleSubmit}
            disabled={!!answerStatus || input.trim() === ''}
          >
            확인
          </button>
        </div>
        <p className="tq-input-hint">⏎ Enter 키로도 제출할 수 있어요</p>
      </div>

    </div>
  );
}
