# Setting up Abductive with Claude's help

This takes about ten minutes and you do not need to know how any of it works. Claude Code will do the installing; you press the keys.

## Before you start

You need two things on your Mac (or Windows or Linux machine):

1. **Claude Code**, the version of Claude that runs in a terminal window. If you have not installed it, go to https://claude.ai/code and follow the instructions there, then sign in with your Claude account. When you can open a terminal, type `claude`, press Enter and see Claude answer, you are ready. A Claude Code sign-in works without an API key, and a Team or Enterprise seat works too when your organisation has turned Claude Code on.
2. **Git**, which Claude Code can install for you in step 2 below. The repository is public, so you need no GitHub account.

## The one message to paste

Open a terminal, type `claude` and press Enter. When Claude is listening, paste the whole of the block below, then press Enter. Claude will ask your permission before each step; say yes.

```
I want to run a research tool called Abductive on this machine. Please do these steps for me, checking each one worked before moving on, and tell me in plain words if anything fails:

1. Check whether "bun" is installed (run: bun --version). If it is not, install it from https://bun.sh (on a Mac: curl -fsSL https://bun.sh/install | bash), then open a fresh shell so it is on the PATH, and confirm bun --version works.
2. Check whether "git" is installed. If not, install it (on a Mac, running "git --version" offers to install the command line tools).
3. Clone the public repository https://github.com/mggrim/abductive-orgsci.git into a folder called "abductive" in my home directory.
4. Inside that folder, run "bun install".
5. Confirm the "claude" command is on the PATH from a plain shell (run: claude --version). The tool talks to Claude through that command.
6. Start the tool with "bun run dev" and leave it running. Tell me the address it prints (it should be http://localhost:5173), and open it in my browser.
7. Tell me how to stop it later (Ctrl+C in this window) and how to start it again (cd ~/abductive, then bun run dev).

Do not install anything else, do not change any settings outside the abductive folder, and do not send any of my files anywhere.
```

## When it is running

- Abductive opens on Getting started, four short screens. On the last one, type a **Project name** and press **Create project** to start your project. Abductive asks one question at a time; write in your own words, rough is fine.
- At the top of the page, if you see a red bar saying **Abductive is running without a model.**, Abductive cannot reach Claude. The usual cause is that `claude` is not on the PATH of the shell that ran `bun run dev`. Ask Claude Code: "The Abductive app says it is running without a model. Check that the claude command works from a plain shell and restart bun run dev."
- Your projects live in your browser only. Nothing is uploaded anywhere. Each question Abductive asks is sent to Claude through your own account, the same as typing it into Claude yourself.

## Updating later

To update to a newer version, paste this into Claude Code:

```
Go to ~/abductive, stop anything running there, run "git pull", then "bun install", then start it again with "bun run dev" and open http://localhost:5173.
```
