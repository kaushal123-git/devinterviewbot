import type { InterviewLanguage } from '@/types';

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  time?: string;
  error?: string;
}

const WANDBOX_API = 'https://wandbox.org/api/compile.json';

/**
 * Wandbox compiler names (verified from https://wandbox.org/api/list.json)
 * Wandbox is a free public online compiler service — no API key required.
 */
const LANG_CONFIG: Record<
  InterviewLanguage,
  { compiler: string; options: string }
> = {
  cpp:        { compiler: 'gcc-head',          options: 'warning,c++17' },
  c:          { compiler: 'gcc-head-c',         options: 'warning' },
  python:     { compiler: 'cpython-3.12.7',     options: '' },
  java:       { compiler: 'openjdk-jdk-22+36',  options: '' },
  typescript: { compiler: 'typescript-5.6.2',   options: '' },
};

interface WandboxResponse {
  status: string;           // "0" on success
  signal?: string;
  compiler_output?: string;
  compiler_error?: string;
  program_output?: string;
  program_error?: string;
  program_message?: string;
}

/**
 * Executes code using the Wandbox public API.
 * No API key, no local compiler installation required.
 * Works for Python, TypeScript, C, C++, and Java on any OS.
 */
export async function runCode(
  code: string,
  language: InterviewLanguage
): Promise<RunResult> {
  const cfg = LANG_CONFIG[language];
  const startTime = Date.now();

  try {
    const body: Record<string, unknown> = {
      compiler: cfg.compiler,
      code,
      options: cfg.options,
      stdin: '',
      'compiler-option-raw': '',
      save: false,
    };

    const response = await fetch(WANDBOX_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        stdout: '',
        stderr: '',
        exitCode: -1,
        error: `Wandbox API error ${response.status}: ${text.slice(0, 300)}`,
      };
    }

    const data: WandboxResponse = await response.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    // Wandbox returns status "0" for success
    const exitCode = parseInt(data.status ?? '0', 10);

    // Combine compile errors with runtime errors
    const stderr = [data.compiler_error, data.program_error]
      .filter(Boolean)
      .join('\n')
      .trim();

    const stdout = (data.program_output ?? '').trim();

    return {
      stdout,
      stderr,
      exitCode,
      time: `${elapsed}s`,
    };
  } catch (err: any) {
    return {
      stdout: '',
      stderr: '',
      exitCode: -1,
      error:
        err?.message?.includes('Failed to fetch')
          ? 'Network error — could not reach wandbox.org. Check your internet connection.'
          : (err?.message ?? 'Unknown error occurred while running code.'),
    };
  }
}
