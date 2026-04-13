#!/bin/bash
set -e

echo ""
echo "LSports Docs — Install"
echo "----------------------"

# Detect OS from uname: Darwin=macOS, MINGW*/MSYS*/CYGWIN*=Windows Git Bash, Linux=Linux
detect_os() {
  case "$(uname -s)" in
    Darwin*)              echo "macos" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    Linux*)               echo "linux" ;;
    *)                    echo "unknown" ;;
  esac
}

OS=$(detect_os)

# Step 1 — Install gh if missing
if ! command -v gh &>/dev/null; then
  echo "Installing GitHub CLI..."
  if [ "$OS" = "macos" ]; then
    brew install gh
  elif [ "$OS" = "windows" ]; then
    if command -v winget &>/dev/null; then
      winget install --id GitHub.cli -e --source winget
    elif command -v choco &>/dev/null; then
      choco install gh -y
    elif command -v scoop &>/dev/null; then
      scoop install gh
    else
      echo ""
      echo "ERROR: Could not install GitHub CLI automatically."
      echo ""
      echo "Please install it manually using one of these options:"
      echo "  Option 1: winget install --id GitHub.cli"
      echo "  Option 2: choco install gh       (requires Chocolatey)"
      echo "  Option 3: scoop install gh        (requires Scoop)"
      echo "  Option 4: Download from https://cli.github.com/"
      echo ""
      echo "After installing, restart this terminal and run the script again."
      exit 1
    fi
  elif [ "$OS" = "linux" ]; then
    if command -v apt-get &>/dev/null; then
      curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
      sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
      sudo apt-get update && sudo apt-get install gh -y
    else
      echo "Please install GitHub CLI manually: https://cli.github.com/"
      exit 1
    fi
  else
    echo "Unsupported OS. Please install GitHub CLI manually: https://cli.github.com/"
    exit 1
  fi
else
  echo "✓ GitHub CLI already installed"
fi

# Step 2 — Auth if needed
if ! gh auth status &>/dev/null; then
  echo ""
  echo "Next: log in to GitHub."
  echo "Run:  gh auth login"
  echo "Choose: GitHub.com → HTTPS → Login with a web browser"
  echo ""
  read -rp "Press Enter once you're logged in..."
  if ! gh auth status &>/dev/null; then
    echo "GitHub auth not detected. Please run 'gh auth login' and try again."
    exit 1
  fi
else
  echo "✓ GitHub already authenticated"
fi

# Step 3 — Clone repo if missing
if [ ! -f ~/lsports-products-docs/CLAUDE.md ]; then
  echo "Cloning docs repo..."
  gh repo clone lsportsltd/lsports-products-docs ~/lsports-products-docs
else
  echo "✓ Repo already cloned"
fi

# Step 4 — Clean up old workflow files
rm -f ~/.claude/lsports-docs/context.md
rm -f ~/.claude/lsports-docs/user-config.md
rm -f ~/.claude/commands/docs.md
rm -f ~/.claude/commands/release-docs-sync.md
rm -rf ~/.claude/skills/release-docs-sync
rmdir ~/.claude/lsports-docs 2>/dev/null || true

# Step 5 — Install /docs command
mkdir -p ~/.claude/commands
cp ~/lsports-products-docs/plugin/commands/docs.md ~/.claude/commands/docs.md
echo "✓ /docs command installed"

# Step 6 — Install setup skill
mkdir -p ~/.claude/skills/setup
cp ~/lsports-products-docs/plugin/skills/setup/SKILL.md ~/.claude/skills/setup/SKILL.md
echo "✓ Setup skill installed"

echo ""
echo "Done! Open Claude Code and type /docs to get started."
echo ""
