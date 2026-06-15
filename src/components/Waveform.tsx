import { useEffect, useRef } from 'react';

interface WaveformProps {
  isRecording: boolean;
  stream: MediaStream | null;
}

export const Waveform = ({ isRecording, stream }: WaveformProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Audio context setup if recording and stream is available
    if (isRecording && stream) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        audioContextRef.current = audioCtx;
        analyserRef.current = analyser;
        sourceRef.current = source;

        const drawRealtime = () => {
          const width = canvas.clientWidth;
          const height = canvas.clientHeight;
          ctx.clearRect(0, 0, width, height);

          analyser.getByteFrequencyData(dataArray);

          // Custom visual: Beautiful symmetric audio wave
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';

          const barCount = 45;
          const barWidth = 3;
          const gap = 4;
          const startX = (width - (barCount * (barWidth + gap) - gap)) / 2;

          for (let i = 0; i < barCount; i++) {
            // Map the symmetric index
            const index = Math.abs(i - Math.floor(barCount / 2));
            // Get frequency level (0 to 255)
            const level = dataArray[index] || 0;
            // Normalize level (0 to 1) and add a small noise/minimum
            const percent = level / 255;
            const minHeight = 4;
            const barHeight = minHeight + percent * (height - minHeight - 10);

            const x = startX + i * (barWidth + gap);
            const y = (height - barHeight) / 2;

            // Harmonious HSL colors matching theme
            const hue = 263 + (i / barCount) * 45; // Purple to Cyan
            ctx.fillStyle = `hsla(${hue}, 90%, 68%, ${0.3 + percent * 0.7})`;
            
            // Draw rounded bar
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 2);
            ctx.fill();
          }

          animationRef.current = requestAnimationFrame(drawRealtime);
        };

        drawRealtime();
      } catch (err) {
        console.error('AudioContext Visualizer failed, falling back to mock.', err);
        drawMockWave();
      }
    } else {
      // Not recording or stream not yet loaded: Draw a gentle ambient standby wave
      let frame = 0;
      const drawIdle = () => {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        ctx.clearRect(0, 0, width, height);

        const barCount = 45;
        const barWidth = 3;
        const gap = 4;
        const startX = (width - (barCount * (barWidth + gap) - gap)) / 2;

        frame++;

        for (let i = 0; i < barCount; i++) {
          // Ambient gentle sine wave motion
          const distanceToCenter = Math.abs(i - Math.floor(barCount / 2)) / (barCount / 2);
          const factor = Math.max(0, 1 - distanceToCenter);
          const sine = Math.sin(frame * 0.05 + i * 0.15);
          const barHeight = 4 + factor * (3 + sine * 2);

          const x = startX + i * (barWidth + gap);
          const y = (height - barHeight) / 2;

          // Gentle standby gray-blue gradient
          ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + factor * 0.15})`;

          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 1.5);
          ctx.fill();
        }

        animationRef.current = requestAnimationFrame(drawIdle);
      };

      drawIdle();
    }

    const activeCanvas = canvas;
    const activeCtx = ctx;

    function drawMockWave() {
      let frame = 0;
      const drawMock = () => {
        const width = activeCanvas.clientWidth;
        const height = activeCanvas.clientHeight;
        activeCtx.clearRect(0, 0, width, height);

        const barCount = 45;
        const barWidth = 3;
        const gap = 4;
        const startX = (width - (barCount * (barWidth + gap) - gap)) / 2;

        frame++;

        for (let i = 0; i < barCount; i++) {
          const indexToCenter = Math.abs(i - Math.floor(barCount / 2)) / (barCount / 2);
          const factor = Math.max(0, 1 - indexToCenter);
          const noise = Math.sin(frame * 0.15 + i * 0.3) * Math.cos(frame * 0.05);
          const percent = (noise + 1) / 2; // 0 to 1
          const barHeight = 4 + factor * (percent * (height - 15));

          const x = startX + i * (barWidth + gap);
          const y = (height - barHeight) / 2;

          const hue = 263 + (i / barCount) * 45;
          activeCtx.fillStyle = `hsla(${hue}, 90%, 68%, ${0.4 + percent * 0.6})`;

          activeCtx.beginPath();
          activeCtx.roundRect(x, y, barWidth, barHeight, 2);
          activeCtx.fill();
        }

        animationRef.current = requestAnimationFrame(drawMock);
      };
      drawMock();
    }

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [isRecording, stream]);

  return (
    <div style={{ width: '100%', height: '80px', display: 'flex', justifyContent: 'center' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          maxWidth: '500px',
        }}
      />
    </div>
  );
};
