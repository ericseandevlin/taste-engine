// run.mjs: one way to start a stage from the command line.
// A failure prints one plain line and exits 1. No stack trace: the user needs
// the cause and the next step, not the call chain. Set TASTE_DEBUG=1 for the stack.
export function runMain(main) {
  Promise.resolve()
    .then(main)
    .catch((err) => {
      console.error(`\n[taste-engine] ${err.message}`);
      if (process.env.TASTE_DEBUG) console.error(err.stack);
      process.exit(1);
    });
}
