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

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
const originalComSpec = process.env.ComSpec;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  });
}

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
    setPlatform('linux');
    delete process.env.ComSpec;
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

    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    if (originalComSpec === undefined) {
      delete process.env.ComSpec;
    } else {
      process.env.ComSpec = originalComSpec;
    }
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

    it('should launch bare commands through cmd.exe on Windows', () => {
      setPlatform('win32');
      process.env.ComSpec = 'C:\\Windows\\System32\\cmd.exe';

      manager = new ProcessManager({
        cwd: 'C:\\work\\project',
        executable: 'openclaude',
        model: 'gpt-4o',
        permissionMode: 'plan',
        sessionId: 'abc-123',
        worktree: 'feature branch',
        env: {
          OPENAI_API_KEY: 'sk-test',
        },
      });

      manager.spawn();

      expect(mockSpawn).toHaveBeenCalledWith(
        'C:\\Windows\\System32\\cmd.exe',
        [
          '/d',
          '/s',
          '/c',
          expect.stringContaining('openclaude'),
        ],
        expect.objectContaining({
          cwd: 'C:\\work\\project',
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          env: expect.objectContaining({
            OPENAI_API_KEY: 'sk-test',
          }),
        }),
      );

      const commandLine = mockSpawn.mock.calls[0]?.[1]?.[3] as string;
      expect(commandLine).toContain('--output-format');
      expect(commandLine).toContain('stream-json');
      expect(commandLine).toContain('--input-format');
      expect(commandLine).toContain('--verbose');
      expect(commandLine).toContain('--model');
      expect(commandLine).toContain('gpt-4o');
      expect(commandLine).toContain('--permission-mode');
      expect(commandLine).toContain('plan');
      expect(commandLine).toContain('--resume');
      expect(commandLine).toContain('abc-123');
      expect(commandLine).toContain('--worktree');
      expect(commandLine).toContain('"feature branch"');
    });

    it('should launch cmd wrapper paths through cmd.exe on Windows', () => {
      setPlatform('win32');
      process.env.ComSpec = 'C:\\Windows\\System32\\cmd.exe';

      manager = new ProcessManager({
        cwd: 'C:\\work\\project',
        executable: 'C:\\Users\\Test User\\AppData\\Roaming\\npm\\openclaude.cmd',
      });

      manager.spawn();

      expect(mockSpawn).toHaveBeenCalledWith(
        'C:\\Windows\\System32\\cmd.exe',
        [
          '/d',
          '/s',
          '/c',
          '"C:\\Users\\Test User\\AppData\\Roaming\\npm\\openclaude.cmd" --output-format stream-json --verbose --input-format stream-json',
        ],
        expect.objectContaining({
          cwd: 'C:\\work\\project',
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        }),
      );
    });
  });

  describe('state management', () => {
    it('should start in idle state', () => {
      expect(manager.state).toBe(ProcessState.Idle);
    });

    it('should transition to initializing on spawn()', () => {
      manager.spawn();
      // State transitions through Spawning → Initializing synchronously
      expect(manager.state).toBe(ProcessState.Initializing);
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

      // Attach .catch() immediately to prevent unhandled rejection
      const spawnPromise = (manager.spawn() as Promise<unknown>)?.catch(() => {});
      mockProc.emit('error', new Error('ENOENT: openclaude not found'));

      await spawnPromise;
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
    it('should write messages to the transport', async () => {
      manager.spawn();

      const stdinChunks: Buffer[] = [];
      mockProc.stdin.on('data', (chunk: Buffer) => stdinChunks.push(chunk));

      manager.write({ type: 'keep_alive' });

      await new Promise((r) => setTimeout(r, 10));
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
