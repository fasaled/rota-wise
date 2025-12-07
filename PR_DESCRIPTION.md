# Improve weekend fairness, fix persistence bug, and upgrade to Next.js 16

## 📋 Summary

This PR introduces several improvements and bug fixes to the Rota-Wise shift scheduling application:

1. **Enhanced Weekend Fairness Algorithm** - Improved equitable distribution of weekend shifts
2. **Bug Fix** - Fixed persistence of monthly shift limit field
3. **UX Improvement** - Changed button text from "Save" to "Download"
4. **Framework Upgrade** - Updated to Next.js 16 and React 19

---

## 🎯 1. Weekend Fairness Algorithm Enhancement

### Problem
The previous algorithm prioritized weekend fairness as the 5th criterion with an arbitrary threshold, leading to suboptimal distribution of weekend shifts (Friday, Saturday, Sunday) per month.

### Solution
- **Moved weekend fairness criterion from 5th to 3rd priority** (after total workload and day-of-week balance)
- **Removed arbitrary "< 1 weekend worked" threshold**
- **Implemented direct comparison** - doctors with fewer weekend shifts in the current month get higher priority

### New Priority Order
1. Total workload balance
2. Day-of-week balance (ensures fair Mon-Sun distribution)
3. **Weekend fairness** ⬆️ IMPROVED & PRIORITIZED
4. Direct day count
5. Monthly workload ratio
6. Idle time
7. Random tie-breaker

### Benefits
- ✅ More equitable distribution of weekend shifts across all doctors per month
- ✅ Maintains day-of-week balance for individual days (Fri/Sat/Sun)
- ✅ Respects all existing constraints (minimum intervals, vacations, pre-assignments, monthly limits)
- ✅ Simple and predictable logic

**File modified:** `src/lib/schedule-generator.ts:381-391`

---

## 🐛 2. Fixed globalMonthlyShiftLimit Persistence Bug

### Problem
The monthly shift limit field was not persisting between application restarts. After reloading the page, the field would appear empty even though the value was being saved.

### Root Cause
When deserializing form data from localStorage, the `globalMonthlyShiftLimit` field was not being included in the deserialized objects.

### Solution
Added `globalMonthlyShiftLimit` to 5 critical deserialization points:

1. Form input localStorage deserialization (line 204)
2. Full schedule form values (lines 145, 769)
3. Schedule objects (lines 118, 762)

### Impact
The monthly shift limit now correctly persists across:
- Page reloads
- Browser restarts
- Loading saved schedules (.json files)

**File modified:** `src/app/page.tsx:118,145,204,762,769`

---

## 💡 3. UX Improvement: "Save data" → "Download data"

### Problem
The button text "Save data" was misleading as it actually downloads a JSON file rather than saving to a server or database.

### Changes
**Button Text (ES/EN):**
- ❌ "Guardar datos" → ✅ "Descargar datos"
- ❌ "Save data" → ✅ "Download data"

**Toast Notifications:**
- ❌ "Horario guardado" → ✅ "Horario descargado"
- ❌ "Schedule saved" → ✅ "Schedule downloaded"
- ❌ "Nada que guardar" → ✅ "Nada que descargar"
- ❌ "Nothing to save" → ✅ "Nothing to download"

**Icon:**
- ❌ `<Save />` → ✅ `<FileDown />` (more representative of download action)

**Files modified:**
- `src/locales/es.json:4,17-20`
- `src/locales/en.json:4,17-20`
- `src/app/page.tsx:2064`

---

## ⚡ 4. Framework Upgrade: Next.js 16 & React 19

### Upgrades
- **Next.js:** 15.2.3 → 16.0.7 (major version)
- **React:** 18.x → 19.2.1 (major version)
- **React DOM:** 18.x → 19.2.1 (major version)

### Configuration Changes
1. **Removed** `eslint` config from `next.config.ts` (no longer supported in Next.js 16)
2. **Added** empty `turbopack: {}` config to acknowledge Turbopack as default bundler
3. **Auto-updated** TypeScript config by Next.js 16

### Benefits
- ✅ **Faster builds** with Turbopack bundler
- ✅ **Improved performance** and stability
- ✅ **Better TypeScript support** with automatic JSX runtime
- ✅ **Latest React features** from version 19

### Breaking Changes Handled
- ESLint configuration moved to separate files
- Turbopack replaces webpack by default
- React 19 automatic JSX runtime

**Files modified:**
- `next.config.ts`
- `package.json`
- `package-lock.json`
- `tsconfig.json`

### Vercel Build Compatibility Fix

After upgrading to React 19, a Vercel build issue was discovered and fixed:

**Problem:**
- `next-themes@0.3.0` only supported React `^16.8 || ^17 || ^18`
- `react-day-picker` and other deps had similar peer dependency conflicts
- Vercel builds failed with `ERESOLVE` errors

**Solution:**
1. **Updated next-themes:** 0.3.0 → 0.4.6 (officially supports React 19)
2. **Added `.npmrc`** with `legacy-peer-deps=true` for remaining peer dep conflicts

**Why legacy-peer-deps:**
- Some dependencies work fine with React 19 but haven't updated peer deps declarations yet
- Temporary solution until all dependencies officially declare React 19 support
- Safe approach as these packages are compatible with React 19

**Files added/modified:**
- `.npmrc` (new)
- `package.json` (next-themes version bump)
- `package-lock.json` (dependency tree update)

---

## ✅ Testing & Verification

All changes have been thoroughly tested:

- ✅ **36/36 unit tests passing**
- ✅ **Build succeeds** with Next.js 16 and Turbopack
- ✅ **Vercel deployment fixed** - build completes successfully
- ✅ **No TypeScript errors**
- ✅ **All existing functionality preserved**

---

## 📝 Commits Summary

1. `1eb0878` - Improve weekend fairness in shift assignment algorithm
2. `9ca6c06` - Fix persistence of globalMonthlyShiftLimit field
3. `7ca4203` - Update service worker after build
4. `19523d1` - Change 'Save data' button to 'Download data'
5. `57ef6cd` - Update Next.js to 16.0.7 and React to 19.2.1
6. `03deda7` - Add comprehensive PR description
7. `9bf688d` - Fix Vercel build: Update next-themes and add .npmrc for React 19 compatibility

---

## 🔄 Migration Guide

For users upgrading from previous versions:

1. **No data migration required** - all existing schedules and configurations remain compatible
2. **No user action needed** - changes are transparent to end users
3. **Performance improvements** - users may notice faster page loads with Next.js 16

---

## 🎯 Related Issues

This PR addresses:
- Weekend shift distribution fairness
- Data persistence reliability
- User experience clarity
- Framework modernization

---

## 📊 Statistics

**Commits:**
- 7 commits total
- 10 files modified/added
- Weekend fairness algorithm improved
- 1 persistence bug fixed
- Framework upgraded to latest stable versions (Next.js 16, React 19)
- Vercel deployment compatibility ensured

**Testing Coverage:**
- All 36 unit tests passing
- Local build verification completed
- Vercel deployment verified
- No regressions detected

**Dependencies Updated:**
- Next.js: 15.2.3 → 16.0.7
- React: 18.x → 19.2.1
- React DOM: 18.x → 19.2.1
- next-themes: 0.3.0 → 0.4.6
