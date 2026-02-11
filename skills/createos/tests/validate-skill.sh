#!/bin/bash
# Skill Validation Script for CreateOS

set -e

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0

echo "=== CreateOS Skill Validation ==="
echo ""

# 1. Check SKILL.md exists and has required fields
echo "1. Checking SKILL.md structure..."
if [ ! -f "$SKILL_DIR/SKILL.md" ]; then
    echo "   ❌ SKILL.md not found"
    ERRORS=$((ERRORS + 1))
else
    # Check frontmatter
    if ! head -20 "$SKILL_DIR/SKILL.md" | grep -q "^name:"; then
        echo "   ❌ Missing 'name' in frontmatter"
        ERRORS=$((ERRORS + 1))
    else
        echo "   ✅ name field present"
    fi

    if ! head -20 "$SKILL_DIR/SKILL.md" | grep -q "^description:"; then
        echo "   ❌ Missing 'description' in frontmatter"
        ERRORS=$((ERRORS + 1))
    else
        echo "   ✅ description field present"
    fi

    if ! head -20 "$SKILL_DIR/SKILL.md" | grep -q "^allowed-tools:"; then
        echo "   ⚠️  Missing 'allowed-tools' (optional but recommended)"
    else
        echo "   ✅ allowed-tools field present"
    fi
fi

# 2. Check line count
echo ""
echo "2. Checking SKILL.md length..."
LINES=$(wc -l < "$SKILL_DIR/SKILL.md")
if [ "$LINES" -gt 500 ]; then
    echo "   ❌ SKILL.md is $LINES lines (should be <500)"
    ERRORS=$((ERRORS + 1))
else
    echo "   ✅ SKILL.md is $LINES lines (under 500 limit)"
fi

# 3. Check description length
echo ""
echo "3. Checking description length..."
DESC_LEN=$(grep "^description:" "$SKILL_DIR/SKILL.md" | head -1 | wc -c)
if [ "$DESC_LEN" -gt 1024 ]; then
    echo "   ❌ Description is $DESC_LEN chars (max 1024)"
    ERRORS=$((ERRORS + 1))
else
    echo "   ✅ Description is $DESC_LEN chars (under 1024 limit)"
fi

# 4. Check for hardcoded URLs
echo ""
echo "4. Checking for hardcoded createos.io URLs..."
HARDCODED=$(grep -r "createos\.io" "$SKILL_DIR" --include="*.md" --include="*.json" --include="*.sh" --include="*.py" 2>/dev/null | grep -v "NEVER construct" | grep -v "like \`https" | grep -v "tests/validate" || true)
if [ -n "$HARDCODED" ]; then
    echo "   ❌ Found hardcoded URLs:"
    echo "$HARDCODED" | head -5
    ERRORS=$((ERRORS + 1))
else
    echo "   ✅ No hardcoded createos.io URLs found"
fi

# 5. Check references exist
echo ""
echo "5. Checking reference files..."
for ref in "core-skills.md" "deployment-patterns.md" "api-reference.md" "troubleshooting.md"; do
    if [ -f "$SKILL_DIR/references/$ref" ]; then
        echo "   ✅ references/$ref exists"
    else
        echo "   ❌ references/$ref missing"
        ERRORS=$((ERRORS + 1))
    fi
done

# 6. Check config exists
echo ""
echo "6. Checking config..."
if [ -f "$SKILL_DIR/config/config.json" ]; then
    if python3 -c "import json; json.load(open('$SKILL_DIR/config/config.json'))" 2>/dev/null; then
        echo "   ✅ config/config.json is valid JSON"
    else
        echo "   ❌ config/config.json is invalid JSON"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "   ❌ config/config.json missing"
    ERRORS=$((ERRORS + 1))
fi

# 7. Check scripts are executable
echo ""
echo "7. Checking scripts..."
for script in "deploy.sh" "quick-deploy.sh"; do
    if [ -f "$SKILL_DIR/scripts/$script" ]; then
        if [ -x "$SKILL_DIR/scripts/$script" ] || head -1 "$SKILL_DIR/scripts/$script" | grep -q "^#!/"; then
            echo "   ✅ scripts/$script exists"
        else
            echo "   ⚠️  scripts/$script missing shebang"
        fi
    else
        echo "   ❌ scripts/$script missing"
        ERRORS=$((ERRORS + 1))
    fi
done

# 8. Check no duplicate content
echo ""
echo "8. Checking for README.md (should not exist)..."
if [ -f "$SKILL_DIR/README.md" ]; then
    echo "   ⚠️  README.md exists (not needed for skills)"
else
    echo "   ✅ No README.md (correct for skills)"
fi

# Summary
echo ""
echo "=== Validation Summary ==="
if [ "$ERRORS" -eq 0 ]; then
    echo "✅ All checks passed! Skill is ready."
    exit 0
else
    echo "❌ $ERRORS error(s) found. Please fix before using."
    exit 1
fi
