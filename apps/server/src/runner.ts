import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { RunResult, TestCase } from "@provenance/shared";

const TIMEOUT_MS = 5_000;

function execute(command: string, args: string[], cwd: string, input: string, timeoutMs = TIMEOUT_MS): Promise<{ stdout: string; stderr: string; error?: string }> {
  return new Promise((resolve) => {
    const process = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; process.kill(); }, timeoutMs);
    process.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    process.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    process.on("error", (error) => { clearTimeout(timeout); resolve({ stdout, stderr, error: error.message }); });
    process.on("close", (code) => { clearTimeout(timeout); resolve({ stdout, stderr, error: timedOut ? "Execution timed out after 5 seconds." : code === 0 ? undefined : stderr || `Process exited with code ${code}.` }); });
    process.stdin.end(`${input}\n`);
  });
}

export async function runCode(language: string, code: string, tests: TestCase[]): Promise<RunResult[]> {
  const directory = await mkdtemp(join(tmpdir(), "provenance-run-"));
  try {
    let command: string;
    let args: string[];
    if (language === "python") {
      await writeFile(join(directory, "main.py"), code);
      command = "python";
      args = ["main.py"];
    } else if (language === "cpp") {
      const executable = join(directory, "main.exe");
      await writeFile(join(directory, "main.cpp"), code);
      const compile = await execute("g++", ["main.cpp", "-O2", "-o", executable], directory, "", 15_000);
      if (compile.error) return tests.map((test, index) => ({ name: `Test ${index + 1}`, input: test.input, expected: test.expected, actual: "", passed: false, error: `Compilation failed: ${compile.error}` }));
      command = executable;
      args = [];
    } else {
      throw new Error(`Unsupported language: ${language}`);
    }
    return await Promise.all(tests.map(async (test, index) => {
      const result = await execute(command, args, directory, test.input);
      const actual = result.stdout.trim();
      return { name: `Test ${index + 1}`, input: test.input, expected: test.expected, actual, passed: !result.error && Number(actual) === test.expected, ...(result.error ? { error: result.error } : {}) };
    }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
