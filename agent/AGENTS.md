# PI Agent Instructions - GEMINI.md Mandates

## CORE MANDATES (STRICT ENFORCEMENT)

### 1. SURGICAL PRECISION
- **ONE ATOMIC CHANGE**: Each edit/write = single logical change
- **IMPACT RADIUS**: grep_search ALL symbol occurrences BEFORE editing
- **ZERO REFACTOR CREEP**: No formatting, comments, or unrelated logic changes
- **JUSTIFY EVERY LINE**: Every changed line must be 100% required

### 2. EMPIRICAL VALIDATION
- **REPRODUCE FIRST**: Create failing test/script BEFORE fixing bugs
- **SEE FAIL → PASS**: Same test must fail then pass for verification
- **CUSTOM STRESS TESTS**: Complex changes need custom verification scripts
- **RE-READ AFTER EDIT**: Confirm surgical precision, no syntax errors

### 3. EFFICIENCY DISCIPLINE
- **≤3 TURN CYCLES**: Turn 1=Mapping, Turn 2=Reproduction, Turn 3=Execution
- **PARALLEL RESEARCH**: Combine independent operations in single tool calls
- **≤5 TURN COMPLEXITY**: Solve complex tasks in <5 turns, zero regressions
- **SIGNAL OVER NOISE**: Minimize back-and-forth, maximize work-per-turn

### 4. GOOGLE L7/L9 PROTOCOLS
- **ATOMIC COMMIT DISCIPLINE**: One logical change = One commit
- **ARCHAEOLOGICAL INTENT**: git log -n5 + git blame BEFORE edits
- **PHILOSOPHIC ALIGNMENT**: Audit against GEMINI.md/README.md, flag conflicts
- **SYSTEMIC IMPACT**: Pattern search for semantic debt, not just symbols

### 5. SECURITY ABSOLUTISM
- **ZERO CREDENTIAL EXPOSURE**: Never log/expose API keys/secrets
- **DEFENSIVE PATTERNS**: AbortController, circuit breakers for Node.js
- **NETWORK ERROR HANDLING**: ECONNRESET, EADDRINUSE, ETIMEDOUT
- **PROCESS.ENV ONLY**: Zero-leak credential handling

## EXECUTION RULES

### BEFORE CODING (MANDATORY)
1. **GREP_SEARCH**: Map all symbol occurrences, affected files
2. **GIT HISTORY**: git log -n5 + git blame on target lines  
3. **IMPACT RADIUS**: Verify no downstream consumer breakage
4. **REPRODUCTION**: Create failing test for bugs

### DURING CODING (MANDATORY)
1. **ONE ATOMIC CHANGE**: Single logical change per edit/write
2. **SURGICAL PRECISION**: Only required lines, no adjacent changes
3. **IDIOMATIC PURISM**: Language-native primitives, no "any" types
4. **NO LINTER SUPPRESSION**: Explicit, type-safe, Google-clean code

### AFTER CODING (MANDATORY)
1. **RE-READ FILE**: Confirm edit precision, no syntax errors
2. **SYSTEM AUDIT**: Re-read file + dependencies
3. **VERIFICATION**: Run reproduction test → must pass
4. **EXISTING TESTS**: Run full test suite, must pass

## WORKFLOW (≤3 TURN TARGET)

**TURN 1 - PARALLEL MAPPING**
```
bash "find . -name '*.js' -type f | head -20"
bash "grep -r 'functionName' --include='*.js' --include='*.ts' ."
bash "git log -n 5 --oneline path/to/file.js"
```

**TURN 2 - REPRODUCTION & STRATEGY**
```
write "reproduce_bug.js" # Create empirical reproduction
bash "node reproduce_bug.js" # Verify failure
```

**TURN 3 - ATOMIC EXECUTION & VERIFICATION**
```
edit "file.js" # Single surgical change
bash "node reproduce_bug.js" # Verify fix
bash "npm test" # Run full test suite
```

## SUCCESS METRICS
- **100% TEST PASS RATE**: All existing tests pass
- **0% REGRESSION RATE**: No breaking changes  
- **≤5 TURN COMPLEXITY**: Complex tasks in <5 turns
- **100% ARCHITECTURAL CONSISTENCY**: No semantic debt
- **0% TECHNICAL DEBT**: No new debt introduced
- **100% HISTORICAL INTENT**: Preserve deliberate design choices

## VIOLATION CONSEQUENCES
- **IMPACT RADIUS MISSING**: Stop, map first
- **NO REPRODUCTION**: Stop, create test first  
- **REFACTOR CREEP**: Revert, surgical only
- **CREDENTIAL EXPOSURE**: Critical failure

## TOOLS FOR COMPLIANCE
- **search**: For research and mapping
- **git_status/git_diff/git_log**: For archaeological intent
- **bash**: For reproduction scripts and verification
- **pi-gsd**: For planning and validation (if available)

## SIMPLE RULES
1. **MAP → REPRODUCE → FIX → VERIFY**
2. **ONE CHANGE PER EDIT**
3. **GREP BEFORE TOUCHING**
4. **TEST BEFORE FIXING**
5. **VERIFY AFTER FIXING**
6. **NO CREDENTIALS IN CODE**
7. **≤5 TURNS PER TASK**
8. **ZERO REGRESSIONS**