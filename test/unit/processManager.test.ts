// test/unit/processManager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter as NodeEventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

// Mock child_process.spawn before importing ProcessManager
const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// Import after mocking
import { ProcessManager, ProcessState } from '../../src/process/processManager';

function createMockProcess(exitCode: number | null = null) {
  const proc = new NodeEventEmitter() as NodeEventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    pid: number;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
    exitCode: number | null;
  };
  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.pid = 12345;
  proc.killed = false;
  proc.exitCode = exitCode;
  proc.kill = vi.fn(() => {
    proc.killed = true;
    proc.emit('exit', 0, null);
  });
  return proc;
}

describe('ProcessManager', () => {
  let manager: ProcessManager;
  let mockProc: ReturnType<typeof createMockProcess>;

  beforeEach(() => {
    mockProc = createMockProcess();
    mockSpawn.mockReturnValue(mockProc);
    manager = new ProcessManager({
      cwd: '/tmp/test-project',
      executable: 'openclaude',
    });
  });

  afterEach(() => {
    manager.dispose();
    vi.clearAllMocks();
  });

  describe('spawn', () => {
    it('should spawn openclaude with correct flags', async () => {
      const spawnPromise = manager.spawn();

      // Simulate initialize response from CLI
      setTimeout(() => {
        mockProc.stdout.write(
          JSON.stringify({
            type: 'control_response',
            response: {
              subtype: 'success',
              request_id: expect.any(String),
              response: {
                commands: [],
                agents: [],
                output_style: 'concise',
                available_output_styles: ['concise', 'verbose'],
                models: [],
                account: {},
              },
            },
          }) + '\n',
        );
      }, 10);

      // Read what was written to stdin (the initialize request)
      const stdinChunks: Buffer[] = [];
      mockProc.stdin.on('data', (chunk: Buffer) => stdinChunks.push(chunk));

      // Wait a bit for the init request to be written
      await new Promise((r) => setTimeout(r, 50));

      expect(mockSpawn).toHaveBeenCalledWith(
        'openclaude',
        expect.arrayContaining([
          '--output-format',
          'stream-json',
          '--input-format',
          'stream-json',
          '--verbose',
        ]),
        expect.objectContaining({
          cwd: '/tmp/test-project',
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      );

      // Verify the initialize request was sent to stdin
      const written = Buffer.concat(stdinChunks).toString();
      if (written.length > 0) {
        const initReq = JSON.parse(written.trim());
        expect(initReq.type).toBe('control_request');
        expect(initReq.request.subtype).toBe('initialize');
      }
    });

    it('should pass environment variables from options', () => {
      manager = new ProcessManager({
        cwd: '/tmp/test-project',
        executable: 'openclaude',
        env: {
          OPENAI_API_KEY: 'sk-test',
          OPENAI_BASE_URL: 'http://localhost:11434/v1',
        },
      });

      manager.spawn();

      expect(mockSpawn).toHaveBeenCalledWith(
        'openclaude',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            OPENAI_API_KEY: 'sk-test',
            OPENAI_BASE_URL: 'http://localhost:11434/v1',
          }),
        }),
      );
    });

    it('should pass --model flag when model is specified', () => {
      manager = new ProcessManager({
        cwd: '/tmp/test-project',
        executable: 'openclaude',
        model: 'gpt-4o',
      });

      manager.spawn();

      expect(mockSpawn).toHaveBeenCalledWith(
        'openclaude',
        expect.arrayContaining(['--model', 'gpt-4o']),
        expect.any(Object),
      );
    });

    it('should pass --permission-mode flag when permissionMode is specified', () => {
      manager = new ProcessManager({
        cwd: '/tmp/test-project',
        executable: 'openclaude',
        permissionMode: 'plan',
      });

      manager.spawn();

      expect(mockSpawn).toHaveBeenCalledWith(
        'openclaude',
        expect.arrayContaining(['--permission-mode', 'plan']),
        expect.any(Object),
      );
    });

    it('should pass --resume flag when sessionId is specified', () => {
      manager = new ProcessManager({
        cwd: '/tmp/test-project',
        executable: 'openclaude',
        sessionId: 'abc-123',
      });

      manager.spawn();

      expect(mockSpawn).toHaveBeenCalledWith(
        'openclaude',
        expect.arrayContaining(['--resume', 'abc-123']),
        expect.any(Object),
      );
    });
  });

  describe('state management', () => {
    it('should start in idle state', () => {
      expect(manager.state).toBe(ProcessState.Idle);
    });

    it('should transition to spawning on spawn()', () => {
      manager.spawn();
      expect(manager.state).toBe(ProcessState.Spawning);
    });
  });

  describe('crash recovery', () => {
    it('should emit exit event on process exit with code 0', async () => {
      const exitFn = vi.fn();
      manager.onExit(exitFn);

      manager.spawn();
      mockProc.emit('exit', 0, null);

      await new Promise((r) => setTimeout(r, 10));
      expect(exitFn).toHaveBeenCalledWith(0, null);
    });

    it('should emit error event on process error', async () => {
      const errorFn = vi.fn();
      manager.onError(errorFn);

      manager.spawn();
      mockProc.emit('error', new Error('ENOENT: openclaude not found'));

      await new Promise((r) => setTimeout(r, 10));
      expect(errorFn).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('ENOENT') }),
      );
    });

    it('should capture stderr for debug logging', async () => {
      const stderrLines: string[] = [];
      manager.onStderr((line) => stderrLines.push(line));

      manager.spawn();
      mockProc.stderr.write('Debug: loading config\n');

      await new Promise((r) => setTimeout(r, 10));
      expect(stderrLines).toContain('Debug: loading config');
    });
  });

  describe('write', () => {
    it('should write messages to the transport', () => {
      manager.spawn();

      const stdinChunks: Buffer[] = [];
      mockProc.stdin.on('data', (chunk: Buffer) => stdinChunks.push(chunk));

      manager.write({ type: 'keep_alive' });

      const written = Buffer.concat(stdinChunks).toString();
      expect(written).toContain('"type":"keep_alive"');
    });
  });

  describe('kill', () => {
    it('should kill the child process', () => {
      manager.spawn();
      manager.kill();

      expect(mockProc.kill).toHaveBeenCalled();
    });

    it('should transition to idle state after kill', async () => {
      manager.spawn();
      manager.kill();

      await new Promise((r) => setTimeout(r, 10));
      expect(manager.state).toBe(ProcessState.Idle);
    });
  });

  describe('dispose', () => {
    it('should clean up all resources', () => {
      manager.spawn();
      manager.dispose();

      expect(mockProc.kill).toHaveBeenCalled();
      expect(manager.state).toBe(ProcessState.Idle);
    });
  });
});
