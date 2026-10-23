/**
 * ============================================================================
 * Chaffey College | Curriculum Overlap & Stackable Pathway Explorer (app.js)
 * ============================================================================
 * Client-Side Single-Page Application (SPA) for Higher Education Institutional
 * Research & Curriculum Pathway Analytics.
 *
 * Core Analytical Capabilities:
 * 1. Cartesian Product Deduplication:
 *    Deduplicates `Program Summary.csv` (flattened at Program x PLO x Course)
 *    using the composite key: [Program Entity Title] + [Subject Code] + [Course Number].
 * 2. Credential Tier Classification:
 *    Categorizes programs into Associate Degrees vs. Certificates.
 * 3. Directional & Jaccard Overlap Engine:
 *    Computes Certificate Subsumption (|S_D ∩ S_C| / |S_C|), Overlapping Units %,
 *    Degree Completion Contribution (|S_D ∩ S_C| / |S_D|), and Jaccard Similarity.
 * 4. Interactive Visualizations:
 *    - Stackable Family Explorer (Expandable Cards + Inline Course Gap Checklist)
 *    - Interactive Network Cluster Graph (Vis.js node-link network + Inspector)
 *    - Overlap Crosswalk Heatmap Matrix (2D Degree x Certificate grid)
 * 5. Client-Side Exports:
 *    - Crosswalk CSV Generator
 *    - Executive Summary PDF Report via html2pdf.js
 * ============================================================================
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
   * 1. APPLICATION STATE
   * ------------------------------------------------------------------------ */
  const state = {
    rawRows: [],                  // Raw parsed CSV rows from PapaParse
    rawRowCount: 0,               // Total rows in CSV prior to deduplication
    allDisciplines: [],           // Sorted list of all unique disciplines in dataset
    statusCounts: {               // Distinct program counts per lifecycle status
      Active: 0,
      'In Review': 0,
      Draft: 0,
      Deactivated: 0
    },

    // User Filter & Model Controls
    filters: {
      searchQuery: '',
      threshold: 80,              // Default: 80% overlap threshold
      metricMode: 'directional',  // 'directional' (Cert in Degree) | 'jaccard'
      statuses: new Set(['Active']),
      disciplines: new Set(),     // Populated with all disciplines on load
      sortBy: 'certCount',        // 'certCount' | 'maxOverlap' | 'alpha' | 'units'
      onlyWithCerts: true,
      excludeGe: false,
      matrixScope: 'matching',    // 'matching' | 'top35' | 'all'
      networkHideIsolated: true
    },

    // Processed & Filtered Analytical Entities
    programsMap: new Map(),       // title -> Program Object (built for active status filter)
    filteredDegrees: [],          // Array of Degree Program objects matching filters
    filteredCerts: [],            // Array of Certificate Program objects matching filters
    programFamilies: [],          // Array of { degree, qualifyingCerts, maxOverlap }
    allQualifyingPairs: [],       // Flat array of all (Degree, Cert) pairs >= threshold
    pairLookupMap: new Map(),     // "degreeTitle|||certTitle" -> OverlapPairResult

    // UI Interaction State
    activeView: 'families',       // 'families' | 'network' | 'matrix'
    expandedFamilies: new Set(),  // Set of degree titles whose cards are expanded
    selectedCertByDegree: new Map(), // degreeTitle -> certTitle for inline gap checklist
    networkInstance: null,        // Vis.js Network instance
    networkPhysicsEnabled: true
  };

  /* ------------------------------------------------------------------------
   * 2. DOM ELEMENT REFERENCES
   * ------------------------------------------------------------------------ */
  const dom = {};

  function cacheDomReferences() {
    // Header & Status
    dom.dataStatusDot = document.getElementById('dataStatusDot');
    dom.dataStatusText = document.getElementById('dataStatusText');
    dom.csvFileInput = document.getElementById('csvFileInput');
    dom.exportCsvBtn = document.getElementById('exportCsvBtn');
    dom.exportPdfBtn = document.getElementById('exportPdfBtn');
    dom.themeToggleBtn = document.getElementById('themeToggleBtn');

    // KPI Ribbon
    dom.kpiTotalPrograms = document.getElementById('kpiTotalPrograms');
    dom.kpiProgramSplit = document.getElementById('kpiProgramSplit');
    dom.kpiProgramFamilies = document.getElementById('kpiProgramFamilies');
    dom.kpiFamilySubtext = document.getElementById('kpiFamilySubtext');
    dom.kpiStackablePairs = document.getElementById('kpiStackablePairs');
    dom.kpiPairsSubtext = document.getElementById('kpiPairsSubtext');
    dom.kpiEmbeddedCerts = document.getElementById('kpiEmbeddedCerts');
    dom.kpiUniqueCourses = document.getElementById('kpiUniqueCourses');
    dom.kpiRawRowsNote = document.getElementById('kpiRawRowsNote');

    // Sidebar Controls
    dom.resetFiltersBtn = document.getElementById('resetFiltersBtn');
    dom.searchInput = document.getElementById('searchInput');
    dom.clearSearchBtn = document.getElementById('clearSearchBtn');
    dom.thresholdSlider = document.getElementById('thresholdSlider');
    dom.thresholdValueDisplay = document.getElementById('thresholdValueDisplay');
    dom.presetPills = document.querySelectorAll('.preset-pill');
    dom.metricDirectionalBtn = document.getElementById('metricDirectionalBtn');
    dom.metricJaccardBtn = document.getElementById('metricJaccardBtn');
    dom.formulaCallout = document.getElementById('formulaCallout');
    dom.statusActiveOnlyBtn = document.getElementById('statusActiveOnlyBtn');
    dom.statusCheckboxes = document.querySelectorAll('input[name="programStatus"]');
    dom.countStatusActive = document.getElementById('countStatusActive');
    dom.countStatusReview = document.getElementById('countStatusReview');
    dom.countStatusDraft = document.getElementById('countStatusDraft');
    dom.countStatusDeactivated = document.getElementById('countStatusDeactivated');

    // Discipline Multi-Select Dropdown
    dom.disciplineDropdown = document.getElementById('disciplineDropdown');
    dom.disciplineDropdownBtn = document.getElementById('disciplineDropdownBtn');
    dom.disciplineTriggerLabel = document.getElementById('disciplineTriggerLabel');
    dom.disciplineSelectionCount = document.getElementById('disciplineSelectionCount');
    dom.disciplineDropdownMenu = document.getElementById('disciplineDropdownMenu');
    dom.disciplineSearchInput = document.getElementById('disciplineSearchInput');
    dom.selectAllDisciplinesBtn = document.getElementById('selectAllDisciplinesBtn');
    dom.clearAllDisciplinesBtn = document.getElementById('clearAllDisciplinesBtn');
    dom.disciplineOptionsList = document.getElementById('disciplineOptionsList');

    // Sort & Toggles
    dom.sortBySelect = document.getElementById('sortBySelect');
    dom.onlyWithCertsToggle = document.getElementById('onlyWithCertsToggle');
    dom.excludeGeToggle = document.getElementById('excludeGeToggle');

    // View Tabs
    dom.viewTabs = document.querySelectorAll('.view-tab');
    dom.tabBadgeFamilies = document.getElementById('tabBadgeFamilies');
    dom.tabBadgeNetwork = document.getElementById('tabBadgeNetwork');
    dom.familyBulkActions = document.getElementById('familyBulkActions');
    dom.expandAllFamiliesBtn = document.getElementById('expandAllFamiliesBtn');
    dom.collapseAllFamiliesBtn = document.getElementById('collapseAllFamiliesBtn');

    // View Panes
    dom.viewFamilies = document.getElementById('viewFamilies');
    dom.viewNetwork = document.getElementById('viewNetwork');
    dom.viewMatrix = document.getElementById('viewMatrix');
    dom.familyCardsContainer = document.getElementById('familyCardsContainer');

    // Network View Elements
    dom.networkCanvas = document.getElementById('networkCanvas');
    dom.networkHideIsolatedToggle = document.getElementById('networkHideIsolatedToggle');
    dom.networkPhysicsBtn = document.getElementById('networkPhysicsBtn');
    dom.networkFitBtn = document.getElementById('networkFitBtn');
    dom.inspectorEmptyState = document.getElementById('inspectorEmptyState');
    dom.inspectorContent = document.getElementById('inspectorContent');

    // Matrix View Elements
    dom.matrixScopeSelect = document.getElementById('matrixScopeSelect');
    dom.matrixDimensionsBadge = document.getElementById('matrixDimensionsBadge');
    dom.matrixScrollContainer = document.getElementById('matrixScrollContainer');

    // Modal & PDF Elements
    dom.comparisonModalBackdrop = document.getElementById('comparisonModalBackdrop');
    dom.modalEyebrow = document.getElementById('modalEyebrow');
    dom.modalTitle = document.getElementById('modalTitle');
    dom.modalBodyContent = document.getElementById('modalBodyContent');
    dom.closeModalBtn = document.getElementById('closeModalBtn');
    dom.pdfReportContent = document.getElementById('pdfReportContent');
  }

  /* ------------------------------------------------------------------------
   * 3. DATASET QUIRKS & NORMALIZATION PIPELINE
   * ------------------------------------------------------------------------ */

  /**
   * Classifies a Program Entity Title into 'Degree' or 'Certificate'.
   * Handles edge cases such as 'Nursing VN to RN: Non-Degree Option Certificate'.
   *
   * @param {string} title - Official Program Entity Title
   * @returns {'Degree' | 'Certificate'}
   */
  function classifyProgramTier(title) {
    const normalized = String(title || '').trim().toLowerCase();
    if (!normalized || normalized.includes('non-degree')) {
      return 'Certificate';
    }
    const degreePatterns = [
      'a.s. degree',
      'a.a. degree',
      'associate in science',
      'associate in arts',
      'associate of science',
      'associate of arts',
      'as-t',
      'aa-t',
      'associate degree'
    ];
    for (const pattern of degreePatterns) {
      if (normalized.includes(pattern)) {
        return 'Degree';
      }
    }
    return 'Certificate';
  }

  /**
   * Checks whether a program title is a General Education / Transfer breadth pattern
   * (e.g., CSU-GE, IGETC, Cal-GETC, Chaffey General Education).
   *
   * @param {string} title
   * @returns {boolean}
   */
  function isGeneralEducationBreadth(title) {
    const t = String(title || '').toLowerCase();
    return (
      t.includes('general education') ||
      t.includes('cal-getc') ||
      t.includes('igetc') ||
      t.includes('intersegmental general education')
    );
  }

  /**
   * Extracts initial metadata (unique disciplines & per-status program counts)
   * from the raw CSV rows immediately upon parsing.
   *
   * @param {Array<Object>} rows
   */
  function indexRawDatasetMetadata(rows) {
    state.rawRows = rows;
    state.rawRowCount = rows.length;

    const disciplineSet = new Set();
    const programsByStatus = {
      Active: new Set(),
      'In Review': new Set(),
      Draft: new Set(),
      Deactivated: new Set()
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const progTitle = String(row['Program Entity Title'] || row['Degree Path'] || '').trim();
      if (!progTitle) continue;

      const status = String(row['Program Status'] || 'Active').trim();
      if (programsByStatus[status]) {
        programsByStatus[status].add(progTitle);
      }

      const disc = String(row['Discipline'] || '').trim();
      if (disc) {
        disciplineSet.add(disc);
      }
    }

    state.allDisciplines = Array.from(disciplineSet).sort((a, b) => a.localeCompare(b));
    state.filters.disciplines = new Set(state.allDisciplines);

    state.statusCounts.Active = programsByStatus.Active.size;
    state.statusCounts['In Review'] = programsByStatus['In Review'].size;
    state.statusCounts.Draft = programsByStatus.Draft.size;
    state.statusCounts.Deactivated = programsByStatus.Deactivated.size;

    // Update status count badges in UI
    dom.countStatusActive.textContent = state.statusCounts.Active;
    dom.countStatusReview.textContent = state.statusCounts['In Review'];
    dom.countStatusDraft.textContent = state.statusCounts.Draft;
    dom.countStatusDeactivated.textContent = state.statusCounts.Deactivated;

    renderDisciplineDropdownOptions();
  }

  /**
   * Deduplicates raw CSV rows for the currently selected lifecycle statuses.
   *
   * CRITICAL DATA GRAIN FIX:
   * The source CSV flattens [Program Entity Title] x [PLO] x [Course Item].
   * We deduplicate courses per program using the composite key:
   *   `[Program Entity Title] + [Subject Code] + [Course Number]`
   * Structural header rows (where Course Number is empty/null) are excluded
   * from course lists.
   */
  function buildDeduplicatedProgramsForActiveStatuses() {
    const programsMap = new Map();
    const statusPriority = { Active: 4, 'In Review': 3, Draft: 2, Deactivated: 1 };

    for (let i = 0; i < state.rawRows.length; i++) {
      const row = state.rawRows[i];
      const status = String(row['Program Status'] || '').trim();

      // Filter by selected Lifecycle Statuses first so deactivated versions
      // of an active program do not pollute active course requirements.
      if (!state.filters.statuses.has(status)) {
        continue;
      }

      const title = String(row['Program Entity Title'] || row['Degree Path'] || '').trim();
      if (!title) continue;

      let prog = programsMap.get(title);
      if (!prog) {
        prog = {
          title,
          tier: classifyProgramTier(title),
          status,
          description: String(row['Program Description'] || '').trim(),
          implementationDate: String(row['Implementation Date'] || '').trim(),
          chancellorCode: String(row['Chancellor_s Office Unique Code'] || '').replace(/\.0$/, '').trim(),
          localCode: String(row['Local Code'] || '').trim(),
          controlNumber: String(row['Program Control Number'] || '').replace(/\.0$/, '').trim(),
          isGeBreadth: isGeneralEducationBreadth(title),
          coursesMap: new Map(),        // canonicalCourseId -> CourseObject
          courseIdsSet: new Set(),      // Set of canonical course IDs ("DRAFT 20")
          disciplinesSet: new Set(),    // Set of academic disciplines in this program
          disciplineCounts: new Map(),  // discipline -> course count (for primary discipline)
          plosSet: new Set(),           // Deduplicated Program Learning Outcomes
          totalUnits: 0                 // Deduplicated sum of Min Units
        };
        programsMap.set(title, prog);
      } else {
        // If multiple statuses are checked, retain highest-priority lifecycle badge
        if ((statusPriority[status] || 0) > (statusPriority[prog.status] || 0)) {
          prog.status = status;
        }
        if (!prog.description && row['Program Description']) {
          prog.description = String(row['Program Description']).trim();
        }
      }

      // Collect distinct Program Learning Outcomes (PLOs)
      const plo = String(row['Program_Program Outcome Outcome'] || '').trim();
      if (plo) {
        prog.plosSet.add(plo);
      }

      // Exclude structural catalog block header rows where Course Number is null/empty
      const courseNum = String(
        row['Course Number'] || row['Program_Course Block_Course Block Item Course Number'] || ''
      ).trim();
      const subjectCode = String(
        row['Program_Course Block_Course Block Item Course Subject Code'] || ''
      ).trim();

      if (!courseNum || !subjectCode) {
        continue;
      }

      // Canonical Course Identifier: e.g., "DRAFT 20"
      const courseId = `${subjectCode} ${courseNum}`;
      const discipline = String(row['Discipline'] || '').trim();
      if (discipline) {
        prog.disciplinesSet.add(discipline);
      }

      // Composite Key Deduplication: [Program Entity Title] + [Subject Code] + [Course Number]
      if (!prog.coursesMap.has(courseId)) {
        const courseTitle = String(
          row['Course Title'] || row['Program_Course Block_Course Block Item Course Title'] || ''
        ).trim();
        const rawMinUnits = parseFloat(row['Min Units']);
        const minUnits = Number.isFinite(rawMinUnits) ? rawMinUnits : 0;
        const rawMaxUnits = parseFloat(row['Max Units']);
        const maxUnits = Number.isFinite(rawMaxUnits) ? rawMaxUnits : null;
        const blockTitle = String(row['Course Block Title'] || '').trim();
        const groupTitle = String(row['Group Title'] || '').trim();

        prog.coursesMap.set(courseId, {
          courseId,
          subjectCode,
          courseNumber: courseNum,
          courseTitle,
          minUnits,
          maxUnits,
          discipline: discipline || 'Unspecified',
          blockTitle,
          groupTitle
        });

        prog.courseIdsSet.add(courseId);
        prog.totalUnits += minUnits;

        if (discipline) {
          prog.disciplineCounts.set(discipline, (prog.disciplineCounts.get(discipline) || 0) + 1);
        }
      }
    }

    // Finalize derived arrays and primary discipline per program
    for (const prog of programsMap.values()) {
      prog.totalUnits = Math.round(prog.totalUnits * 100) / 100;
      prog.coursesList = Array.from(prog.coursesMap.values()).sort((a, b) =>
        a.courseId.localeCompare(b.courseId, undefined, { numeric: true })
      );
      prog.disciplinesList = Array.from(prog.disciplinesSet).sort();

      // Determine primary discipline (most courses in that discipline)
      let topDisc = 'General / Interdisciplinary';
      let maxCount = 0;
      for (const [disc, cnt] of prog.disciplineCounts.entries()) {
        if (cnt > maxCount) {
          maxCount = cnt;
          topDisc = disc;
        }
      }
      prog.primaryDiscipline = topDisc;
      prog.plosList = Array.from(prog.plosSet);
    }

    state.programsMap = programsMap;
  }

  /* ------------------------------------------------------------------------
   * 4. OVERLAP & STACKABLE FAMILY ALGORITHM ENGINE
   * ------------------------------------------------------------------------ */

  /**
   * Computes directional and bidirectional overlap metrics between a Degree (D)
   * and a Certificate (C).
   *
   * Metrics Calculated:
   * - Shared Courses: S_D ∩ S_C
   * - Stackable Overlap % (Directional): (|S_D ∩ S_C| / |S_C|) * 100
   * - Jaccard Similarity % (Bidirectional): (|S_D ∩ S_C| / |S_D ∪ S_C|) * 100
   * - Overlapping Units %: (Sum of Min Units in Shared / Sum of Min Units in S_C) * 100
   * - Degree Completion Contribution %: (|S_D ∩ S_C| / |S_D|) * 100
   *
   * @param {Object} degree - Deduplicated Degree Program entity
   * @param {Object} cert - Deduplicated Certificate Program entity
   * @returns {Object} Overlap analysis object
   */
  function computePairOverlap(degree, cert) {
    const sharedCourses = [];
    const certGapCourses = []; // In Certificate C, but missing from Degree D
    let sharedUnits = 0;

    for (const course of cert.coursesList) {
      if (degree.coursesMap.has(course.courseId)) {
        sharedCourses.push(course);
        sharedUnits += course.minUnits;
      } else {
        certGapCourses.push(course);
      }
    }

    const degreeOnlyCourses = []; // In Degree D, beyond Certificate C
    for (const course of degree.coursesList) {
      if (!cert.coursesMap.has(course.courseId)) {
        degreeOnlyCourses.push(course);
      }
    }

    const dCount = degree.coursesList.length;
    const cCount = cert.coursesList.length;
    const sharedCount = sharedCourses.length;
    const unionCount = dCount + cCount - sharedCount;

    const stackableOverlapPct = cCount > 0 ? (sharedCount / cCount) * 100 : 0;
    const jaccardOverlapPct = unionCount > 0 ? (sharedCount / unionCount) * 100 : 0;
    const degreeContributionPct = dCount > 0 ? (sharedCount / dCount) * 100 : 0;

    const overlappingUnitsPct =
      cert.totalUnits > 0 ? (sharedUnits / cert.totalUnits) * 100 : stackableOverlapPct;
    const degreeUnitsContributionPct =
      degree.totalUnits > 0 ? (sharedUnits / degree.totalUnits) * 100 : 0;

    const certAdditionalUnits = Math.max(0, Math.round((cert.totalUnits - sharedUnits) * 100) / 100);
    const degreeRemainingUnits = Math.max(0, Math.round((degree.totalUnits - sharedUnits) * 100) / 100);
    sharedUnits = Math.round(sharedUnits * 100) / 100;

    const activeOverlapPct =
      state.filters.metricMode === 'jaccard' ? jaccardOverlapPct : stackableOverlapPct;

    return {
      degree,
      cert,
      sharedCourses,
      certGapCourses,
      degreeOnlyCourses,
      sharedCount,
      certCourseCount: cCount,
      degreeCourseCount: dCount,
      sharedUnits,
      certAdditionalUnits,
      degreeRemainingUnits,
      stackableOverlapPct,
      jaccardOverlapPct,
      activeOverlapPct,
      overlappingUnitsPct,
      degreeContributionPct,
      degreeUnitsContributionPct,
      isEmbeddedMilestone: sharedCount === cCount && cCount > 0
    };
  }

  /**
   * Checks if a program matches the user's current Discipline and Search filters.
   *
   * @param {Object} prog - Program object
   * @param {string} searchLower - Lowercase search query
   * @returns {boolean}
   */
  function programMatchesFilters(prog, searchLower) {
    // Exclude programs with 0 deduplicated courses
    if (prog.coursesList.length === 0) {
      return false;
    }

    // Optional GE Breadth filter
    if (state.filters.excludeGe && prog.isGeBreadth) {
      return false;
    }

    // Discipline filter: include program if any of its disciplines are selected
    if (state.filters.disciplines.size === 0) {
      return false;
    }
    if (state.filters.disciplines.size < state.allDisciplines.length) {
      let hasMatchingDiscipline = false;
      for (const d of prog.disciplinesSet) {
        if (state.filters.disciplines.has(d)) {
          hasMatchingDiscipline = true;
          break;
        }
      }
      if (!hasMatchingDiscipline) return false;
    }

    // Search query filter (matches Program Title, Course ID, or Course Title)
    if (searchLower) {
      const titleMatch = prog.title.toLowerCase().includes(searchLower);
      const discMatch = prog.primaryDiscipline.toLowerCase().includes(searchLower);
      let courseMatch = false;
      if (!titleMatch && !discMatch) {
        for (const c of prog.coursesList) {
          if (
            c.courseId.toLowerCase().includes(searchLower) ||
            c.courseTitle.toLowerCase().includes(searchLower)
          ) {
            courseMatch = true;
            break;
          }
        }
      }
      return titleMatch || discMatch || courseMatch;
    }

    return true;
  }

  /**
   * Runs the full analytical pipeline:
   * 1. Deduplicates programs for active statuses
   * 2. Applies discipline, GE, and search filters
   * 3. Computes Degree x Certificate overlaps and forms Program Families
   * 4. Updates KPIs and triggers active view rendering
   */
  function runAnalysisPipeline() {
    buildDeduplicatedProgramsForActiveStatuses();

    const searchLower = state.filters.searchQuery.trim().toLowerCase();
    const threshold = state.filters.threshold;

    const allDegrees = [];
    const allCerts = [];

    for (const prog of state.programsMap.values()) {
      if (state.filters.excludeGe && prog.isGeBreadth) continue;
      if (prog.coursesList.length === 0) continue;

      if (prog.tier === 'Degree') {
        allDegrees.push(prog);
      } else {
        allCerts.push(prog);
      }
    }

    // Filter Degrees & Certificates by Discipline & Search
    // Note: If a user searches for a specific Certificate or Degree, we also keep
    // qualifying family members connected to matched programs so families stay intact!
    const directMatchedDegrees = new Set();
    const directMatchedCerts = new Set();

    for (const d of allDegrees) {
      if (programMatchesFilters(d, searchLower)) {
        directMatchedDegrees.add(d.title);
      }
    }
    for (const c of allCerts) {
      if (programMatchesFilters(c, searchLower)) {
        directMatchedCerts.add(c.title);
      }
    }

    const pairLookupMap = new Map();
    const allQualifyingPairs = [];
    const families = [];
    const includedDegreesMap = new Map();
    const includedCertsMap = new Map();

    for (const degree of allDegrees) {
      const degreeMatchesDirectly = directMatchedDegrees.has(degree.title);
      const qualifyingCerts = [];

      for (const cert of allCerts) {
        const certMatchesDirectly = directMatchedCerts.has(cert.title);

        // At least one of the two programs must match the active discipline/search filter,
        // and both must pass discipline filter if no search query is active
        if (!searchLower) {
          if (!degreeMatchesDirectly || !certMatchesDirectly) continue;
        } else {
          if (!degreeMatchesDirectly && !certMatchesDirectly) continue;
          // Ensure discipline filter still applies when searching
          if (!programMatchesFilters(degree, '') || !programMatchesFilters(cert, '')) continue;
        }

        const pairResult = computePairOverlap(degree, cert);
        if (pairResult.sharedCount > 0) {
          pairLookupMap.set(`${degree.title}|||${cert.title}`, pairResult);
        }

        if (pairResult.activeOverlapPct >= threshold) {
          qualifyingCerts.push(pairResult);
          allQualifyingPairs.push(pairResult);
          includedDegreesMap.set(degree.title, degree);
          includedCertsMap.set(cert.title, cert);
        }
      }

      // Sort qualifying certificates within each family by activeOverlapPct DESC, then sharedUnits DESC
      qualifyingCerts.sort((a, b) => {
        if (Math.abs(b.activeOverlapPct - a.activeOverlapPct) > 0.001) {
          return b.activeOverlapPct - a.activeOverlapPct;
        }
        return b.sharedUnits - a.sharedUnits;
      });

      const shouldIncludeFamily = state.filters.onlyWithCerts
        ? qualifyingCerts.length > 0
        : degreeMatchesDirectly || qualifyingCerts.length > 0;

      if (shouldIncludeFamily) {
        const maxOverlap =
          qualifyingCerts.length > 0 ? qualifyingCerts[0].activeOverlapPct : 0;
        const embeddedCount = qualifyingCerts.filter((q) => q.isEmbeddedMilestone).length;

        families.push({
          degree,
          qualifyingCerts,
          maxOverlap,
          embeddedCount
        });
        includedDegreesMap.set(degree.title, degree);
      }
    }

    // Include standalone matched certificates in filteredCerts
    for (const c of allCerts) {
      if (directMatchedCerts.has(c.title)) {
        includedCertsMap.set(c.title, c);
      }
    }

    // Sort Program Families according to user selection
    const sortBy = state.filters.sortBy;
    families.sort((a, b) => {
      if (sortBy === 'certCount') {
        if (b.qualifyingCerts.length !== a.qualifyingCerts.length) {
          return b.qualifyingCerts.length - a.qualifyingCerts.length;
        }
        if (Math.abs(b.maxOverlap - a.maxOverlap) > 0.01) {
          return b.maxOverlap - a.maxOverlap;
        }
        return a.degree.title.localeCompare(b.degree.title);
      }
      if (sortBy === 'maxOverlap') {
        if (Math.abs(b.maxOverlap - a.maxOverlap) > 0.01) {
          return b.maxOverlap - a.maxOverlap;
        }
        return b.qualifyingCerts.length - a.qualifyingCerts.length;
      }
      if (sortBy === 'units') {
        return b.degree.totalUnits - a.degree.totalUnits;
      }
      return a.degree.title.localeCompare(b.degree.title);
    });

    state.filteredDegrees = Array.from(includedDegreesMap.values());
    state.filteredCerts = Array.from(includedCertsMap.values());
    state.programFamilies = families;
    state.allQualifyingPairs = allQualifyingPairs;
    state.pairLookupMap = pairLookupMap;

    // Auto-expand top 4 program families on initial load if none expanded
    if (state.expandedFamilies.size === 0 && families.length > 0) {
      for (let i = 0; i < Math.min(4, families.length); i++) {
        const fam = families[i];
        state.expandedFamilies.add(fam.degree.title);
        if (fam.qualifyingCerts.length > 0 && !state.selectedCertByDegree.has(fam.degree.title)) {
          state.selectedCertByDegree.set(fam.degree.title, fam.qualifyingCerts[0].cert.title);
        }
      }
    }

    updateKpiSummaryRibbon();
    renderActiveView();
  }

  /* ------------------------------------------------------------------------
   * 5. KPI RIBBON & UI RENDERING
   * ------------------------------------------------------------------------ */

  function updateKpiSummaryRibbon() {
    const degCount = state.filteredDegrees.length;
    const certCount = state.filteredCerts.length;
    const totalProgs = degCount + certCount;

    const familiesWithCerts = state.programFamilies.filter(
      (f) => f.qualifyingCerts.length > 0
    ).length;

    const totalPairs = state.allQualifyingPairs.length;
    const embeddedMilestonePairs = state.allQualifyingPairs.filter(
      (p) => p.isEmbeddedMilestone
    ).length;

    // Count unique catalog courses across all filtered programs
    const uniqueCourses = new Set();
    let deduplicatedProgramCoursePairs = 0;
    for (const d of state.filteredDegrees) {
      deduplicatedProgramCoursePairs += d.coursesList.length;
      for (const cId of d.courseIdsSet) uniqueCourses.add(cId);
    }
    for (const c of state.filteredCerts) {
      deduplicatedProgramCoursePairs += c.coursesList.length;
      for (const cId of c.courseIdsSet) uniqueCourses.add(cId);
    }

    dom.kpiTotalPrograms.textContent = totalProgs.toLocaleString();
    dom.kpiProgramSplit.textContent = `${degCount} Degrees • ${certCount} Certificates`;

    dom.kpiProgramFamilies.textContent = familiesWithCerts.toLocaleString();
    dom.kpiFamilySubtext.textContent = `Degrees with ≥1 cert at ≥${state.filters.threshold}%`;

    dom.kpiStackablePairs.textContent = totalPairs.toLocaleString();
    dom.kpiPairsSubtext.textContent =
      state.filters.metricMode === 'jaccard'
        ? `Jaccard similarity ≥ ${state.filters.threshold}%`
        : `Directional overlap ≥ ${state.filters.threshold}%`;

    dom.kpiEmbeddedCerts.textContent = embeddedMilestonePairs.toLocaleString();

    dom.kpiUniqueCourses.textContent = uniqueCourses.size.toLocaleString();
    dom.kpiRawRowsNote.textContent = `${deduplicatedProgramCoursePairs.toLocaleString()} distinct reqs (from ${state.rawRowCount.toLocaleString()} CSV rows)`;

    // Update View Tab Badges
    dom.tabBadgeFamilies.textContent = state.programFamilies.length;
    dom.tabBadgeNetwork.textContent = totalPairs;
  }

  function renderActiveView() {
    if (state.activeView === 'families') {
      renderFamilyExplorerView();
    } else if (state.activeView === 'network') {
      renderNetworkClusterView();
    } else if (state.activeView === 'matrix') {
      renderCrosswalkMatrixView();
    }
  }

  /* ------------------------------------------------------------------------
   * 6. VIEW 1: STACKABLE FAMILY EXPLORER (CARD/TREE DECK)
   * ------------------------------------------------------------------------ */

  function getOverlapBadgeClass(pct, isEmbedded) {
    if (isEmbedded || pct >= 99.95) return 'overlap-100';
    if (pct >= 80) return 'overlap-high';
    return 'overlap-mid';
  }

  function getProgressFillClass(pct, isEmbedded) {
    if (isEmbedded || pct >= 99.95) return 'fill-100';
    if (pct >= 80) return 'fill-high';
    return 'fill-mid';
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Generates the HTML markup for a Course Gap Checklist (used both inline inside
   * a Family Card and inside the comparison Modal).
   *
   * @param {Object} pair - Computed OverlapPairResult
   * @param {boolean} isModal - Whether rendered inside the full modal dialog
   * @returns {string} HTML string
   */
  function buildCourseGapChecklistHtml(pair, isModal) {
    const {
      degree,
      cert,
      sharedCourses,
      certGapCourses,
      degreeOnlyCourses,
      sharedCount,
      certCourseCount,
      degreeCourseCount,
      sharedUnits,
      certAdditionalUnits,
      degreeRemainingUnits,
      stackableOverlapPct,
      jaccardOverlapPct,
      overlappingUnitsPct,
      degreeContributionPct,
      isEmbeddedMilestone
    } = pair;

    const sharedBadgesHtml = sharedCourses.length
      ? sharedCourses
          .map(
            (c) => `
          <div class="course-chip course-chip-shared">
            <div>
              <span class="course-chip-code">&#10003; ${escapeHtml(c.courseId)}</span>
              <span class="course-chip-title">${escapeHtml(c.courseTitle)}</span>
            </div>
            <span class="course-chip-units">${c.minUnits} u</span>
          </div>`
          )
          .join('')
      : `<div class="control-hint">No shared courses found.</div>`;

    const certGapBadgesHtml = isEmbeddedMilestone
      ? `<div class="milestone-celebration-banner">
           &#127942; <strong>100% Embedded Milestone!</strong><br/>
           Every course required for <em>${escapeHtml(cert.title)}</em> is already part of <em>${escapeHtml(degree.title)}</em>. Students earn this certificate automatically with <strong>0 extra courses</strong>.
         </div>`
      : certGapCourses
          .map(
            (c) => `
          <div class="course-chip course-chip-gap">
            <div>
              <span class="course-chip-code">&#9888; ${escapeHtml(c.courseId)}</span>
              <span class="course-chip-title">${escapeHtml(c.courseTitle)}</span>
            </div>
            <span class="course-chip-units">+${c.minUnits} u</span>
          </div>`
          )
          .join('');

    const degreeOnlyBadgesHtml = degreeOnlyCourses.length
      ? degreeOnlyCourses
          .map(
            (c) => `
          <div class="course-chip course-chip-degree-only">
            <div>
              <span class="course-chip-code">&rarr; ${escapeHtml(c.courseId)}</span>
              <span class="course-chip-title">${escapeHtml(c.courseTitle)}</span>
            </div>
            <span class="course-chip-units">${c.minUnits} u</span>
          </div>`
          )
          .join('')
      : `<div class="milestone-celebration-banner">All degree courses are covered by this certificate!</div>`;

    return `
      <div class="${isModal ? 'modal-checklist-wrapper' : 'gap-checklist-drawer'}">
        <div class="drawer-header">
          <div>
            <h4 class="drawer-title">
              Course Gap Checklist: ${escapeHtml(cert.title)} &rarr; ${escapeHtml(degree.title)}
            </h4>
            <div class="drawer-subtitle">
              Stackable Subsumption: <strong>${stackableOverlapPct.toFixed(1)}%</strong> (${sharedCount}/${certCourseCount} cert courses) &bull;
              Unit Overlap: <strong>${overlappingUnitsPct.toFixed(1)}%</strong> &bull;
              Degree Completion Knocked Out: <strong>${degreeContributionPct.toFixed(1)}%</strong> (${sharedCount}/${degreeCourseCount} degree courses) &bull;
              Jaccard Similarity: <strong>${jaccardOverlapPct.toFixed(1)}%</strong>
            </div>
          </div>
          ${
            !isModal
              ? `<button type="button" class="btn btn-secondary btn-xs js-open-pair-modal"
                   data-degree="${escapeHtml(degree.title)}"
                   data-cert="${escapeHtml(cert.title)}">
                   Full Side-by-Side &amp; PLOs
                 </button>`
              : ''
          }
        </div>

        <!-- 4-Card Unit Tally Breakdown -->
        <div class="unit-tally-grid">
          <div class="tally-box tally-box-green">
            <div class="tally-label">Units Shared (Embedded)</div>
            <div class="tally-val">${sharedUnits} Units</div>
            <div class="tally-sub">${sharedCount} shared courses (${overlappingUnitsPct.toFixed(0)}% of Cert)</div>
          </div>
          <div class="tally-box tally-box-orange">
            <div class="tally-label">Additional Units for Cert</div>
            <div class="tally-val">${certAdditionalUnits} Units</div>
            <div class="tally-sub">${certGapCourses.length} extra course(s) needed for Cert</div>
          </div>
          <div class="tally-box tally-box-blue">
            <div class="tally-label">Remaining Degree Major Units</div>
            <div class="tally-val">${degreeRemainingUnits} Units</div>
            <div class="tally-sub">${degreeOnlyCourses.length} additional course(s) to finish Degree</div>
          </div>
          <div class="tally-box tally-box-gold">
            <div class="tally-label">Degree Completion Impact</div>
            <div class="tally-val">${degreeContributionPct.toFixed(1)}%</div>
            <div class="tally-sub">Completes ${sharedCount} of ${degreeCourseCount} degree courses</div>
          </div>
        </div>

        <!-- 3-Column Course Comparison -->
        <div class="checklist-columns">
          <div class="checklist-col">
            <div class="checklist-col-header col-header-green">
              <span>&#9989; Embedded / Satisfied Courses (Shared)</span>
              <span>${sharedCount} (${sharedUnits} u)</span>
            </div>
            <div class="course-badge-list">
              ${sharedBadgesHtml}
            </div>
          </div>

          <div class="checklist-col">
            <div class="checklist-col-header col-header-orange">
              <span>&#9888;&#65039; Remaining Courses Needed for Certificate</span>
              <span>${certGapCourses.length} (${certAdditionalUnits} u)</span>
            </div>
            <div class="course-badge-list">
              ${certGapBadgesHtml}
            </div>
          </div>

          <div class="checklist-col">
            <div class="checklist-col-header col-header-blue">
              <span>&#127891; Additional Courses to Complete Degree</span>
              <span>${degreeOnlyCourses.length} (${degreeRemainingUnits} u)</span>
            </div>
            <div class="course-badge-list">
              ${degreeOnlyBadgesHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderFamilyExplorerView() {
    const families = state.programFamilies;
    if (families.length === 0) {
      dom.familyCardsContainer.innerHTML = `
        <div class="empty-state-box">
          <h3>No Program Families Match Current Filter Criteria</h3>
          <p>Try lowering the <strong>Min Overlap Threshold</strong> slider (currently ${state.filters.threshold}%), clearing the search bar, or enabling additional disciplines.</p>
        </div>
      `;
      return;
    }

    const htmlChunks = [];

    for (const family of families) {
      const { degree, qualifyingCerts, embeddedCount } = family;
      const isExpanded = state.expandedFamilies.has(degree.title);
      const selectedCertTitle = state.selectedCertByDegree.get(degree.title) || null;
      const statusClass = `status-pill-${degree.status.replace(/\s+/g, '')}`;

      // Find currently selected certificate pair for inline drawer
      let activeDrawerPair = null;
      if (selectedCertTitle) {
        activeDrawerPair = qualifyingCerts.find((p) => p.cert.title === selectedCertTitle) || null;
      }

      const certCardsHtml =
        qualifyingCerts.length > 0
          ? `<div class="cert-cards-grid">
              ${qualifyingCerts
                .map((pair) => {
                  const pct = pair.activeOverlapPct;
                  const badgeClass = getOverlapBadgeClass(pct, pair.isEmbeddedMilestone);
                  const fillClass = getProgressFillClass(pct, pair.isEmbeddedMilestone);
                  const isSelected = selectedCertTitle === pair.cert.title;

                  return `
                    <div class="cert-milestone-card ${
                      pair.isEmbeddedMilestone ? 'is-100-milestone' : ''
                    } ${isSelected ? 'selected' : ''}"
                         data-degree="${escapeHtml(degree.title)}"
                         data-cert="${escapeHtml(pair.cert.title)}">
                      <div class="cert-card-top">
                        <div>
                          <div class="family-badges-row">
                            <span class="tier-pill tier-cert">${
                              pair.isEmbeddedMilestone ? '&#9733; 100% Milestone' : 'Certificate'
                            }</span>
                            <span class="status-pill status-pill-${pair.cert.status.replace(
                              /\s+/g,
                              ''
                            )}">${escapeHtml(pair.cert.status)}</span>
                          </div>
                          <h4 class="cert-card-title">${escapeHtml(pair.cert.title)}</h4>
                        </div>
                        <span class="overlap-pct-badge ${badgeClass}">
                          ${pct.toFixed(0)}%
                        </span>
                      </div>

                      <div class="cert-progress-track">
                        <div class="cert-progress-fill ${fillClass}" style="width: ${Math.min(
                    100,
                    pct
                  )}%"></div>
                      </div>

                      <div class="cert-card-metrics">
                        <span><strong>${pair.sharedCount}/${
                    pair.certCourseCount
                  }</strong> cert courses shared (${pair.sharedUnits}/${pair.cert.totalUnits} u)</span>
                        <span>Completes <strong>${pair.degreeContributionPct.toFixed(
                          0
                        )}%</strong> of Degree</span>
                      </div>

                      <div class="cert-action-hint">
                        <span>${
                          isSelected
                            ? '&#9660; Viewing Course Gap Checklist below'
                            : '&#9654; Click to inspect Course Gap Checklist'
                        }</span>
                        <span>${
                          pair.certGapCourses.length === 0
                            ? '0 extra courses'
                            : `+${pair.certGapCourses.length} gap course(s)`
                        }</span>
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>`
          : `<div class="control-hint">No certificates meet the ${state.filters.threshold}% overlap threshold for this degree.</div>`;

      htmlChunks.push(`
        <article class="family-card" data-degree-card="${escapeHtml(degree.title)}">
          <div class="family-card-header js-toggle-family" data-degree="${escapeHtml(degree.title)}">
            <div class="family-degree-info">
              <div class="family-badges-row">
                <span class="tier-pill tier-degree">Associate Degree Anchor</span>
                <span class="status-pill ${statusClass}">${escapeHtml(degree.status)}</span>
                ${degree.disciplinesList
                  .slice(0, 3)
                  .map((d) => `<span class="discipline-tag">${escapeHtml(d)}</span>`)
                  .join('')}
                ${
                  degree.disciplinesList.length > 3
                    ? `<span class="discipline-tag">+${degree.disciplinesList.length - 3} more</span>`
                    : ''
                }
              </div>
              <h3 class="family-degree-title">${escapeHtml(degree.title)}</h3>
              <div class="family-degree-meta">
                <span><strong>${degree.coursesList.length}</strong> Unique Courses</span>
                <span>&bull;</span>
                <span><strong>${degree.totalUnits}</strong> Min Catalog Units</span>
                ${
                  embeddedCount > 0
                    ? `<span>&bull;</span><span style="color: var(--accent-gold); font-weight: 700;">&#9733; ${embeddedCount} Automatic 100% Milestone(s)</span>`
                    : ''
                }
                ${
                  degree.localCode
                    ? `<span>&bull;</span><span>Local ID: ${escapeHtml(degree.localCode)}</span>`
                    : ''
                }
              </div>
            </div>

            <div class="family-header-right">
              <button type="button" class="btn btn-ghost btn-xs js-inspect-program" data-program="${escapeHtml(
                degree.title
              )}" title="Inspect full Degree course blocks and Program Learning Outcomes">
                Degree Courses &amp; PLOs
              </button>
              <div class="stackable-count-badge">
                <span class="stackable-count-num">${qualifyingCerts.length} Stackable</span>
                <span class="stackable-count-label">${
                  qualifyingCerts.length === 1 ? 'Certificate' : 'Certificates'
                } &ge;${state.filters.threshold}%</span>
              </div>
            </div>
          </div>

          <div class="family-body ${isExpanded ? '' : 'hidden'}">
            ${certCardsHtml}
            ${activeDrawerPair ? buildCourseGapChecklistHtml(activeDrawerPair, false) : ''}
          </div>
        </article>
      `);
    }

    dom.familyCardsContainer.innerHTML = htmlChunks.join('');
  }

  /* ------------------------------------------------------------------------
   * 7. VIEW 2: INTERACTIVE NETWORK CLUSTER GRAPH (VIS.JS)
   * ------------------------------------------------------------------------ */

  function renderNetworkClusterView() {
    if (typeof vis === 'undefined') {
      dom.networkCanvas.innerHTML = `<div class="empty-state-box">Vis.js library failed to load from CDN.</div>`;
      return;
    }

    const hideIsolated = state.filters.networkHideIsolated;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    const connectedDegrees = new Set();
    const connectedCerts = new Set();
    const embeddedCertTitles = new Set();

    for (const pair of state.allQualifyingPairs) {
      connectedDegrees.add(pair.degree.title);
      connectedCerts.add(pair.cert.title);
      if (pair.isEmbeddedMilestone) {
        embeddedCertTitles.add(pair.cert.title);
      }
    }

    const nodesArray = [];
    const edgesArray = [];

    // Build Degree Nodes (Chaffey Crimson #990000)
    for (const deg of state.filteredDegrees) {
      if (hideIsolated && !connectedDegrees.has(deg.title)) continue;
      const sizeVal = Math.max(16, Math.min(42, 12 + Math.sqrt(deg.totalUnits) * 2.6));

      nodesArray.push({
        id: deg.title,
        label: truncateText(deg.title, 34),
        title: `${deg.title}\nTier: Associate Degree (${deg.status})\nCourses: ${deg.coursesList.length} | Units: ${deg.totalUnits}`,
        shape: 'dot',
        size: sizeVal,
        color: {
          background: '#990000',
          border: '#FCA5A5',
          highlight: { background: '#DC2626', border: '#FFFFFF' }
        },
        font: {
          color: isDark ? '#F8FAFC' : '#1F2937',
          size: 12,
          face: 'Inter, sans-serif',
          strokeWidth: isDark ? 3 : 4,
          strokeColor: isDark ? '#0F172A' : '#FFFFFF'
        }
      });
    }

    // Build Certificate Nodes (Milestone Gold #D97706 or Slate #475569)
    for (const cert of state.filteredCerts) {
      if (hideIsolated && !connectedCerts.has(cert.title)) continue;
      const isMilestone = embeddedCertTitles.has(cert.title);
      const sizeVal = Math.max(12, Math.min(34, 10 + Math.sqrt(cert.totalUnits) * 2.2));

      nodesArray.push({
        id: cert.title,
        label: truncateText(cert.title, 30),
        title: `${cert.title}\nTier: Certificate (${cert.status})\nCourses: ${cert.coursesList.length} | Units: ${cert.totalUnits}`,
        shape: 'dot',
        size: sizeVal,
        color: isMilestone
          ? {
              background: '#D97706',
              border: '#FDE68A',
              highlight: { background: '#F59E0B', border: '#FFFFFF' }
            }
          : {
              background: '#475569',
              border: '#CBD5E1',
              highlight: { background: '#64748B', border: '#FFFFFF' }
            },
        font: {
          color: isDark ? '#E2E8F0' : '#374151',
          size: 11,
          face: 'Inter, sans-serif',
          strokeWidth: isDark ? 3 : 4,
          strokeColor: isDark ? '#0F172A' : '#FFFFFF'
        }
      });
    }

    // Build Edges where overlap >= threshold
    for (const pair of state.allQualifyingPairs) {
      const pct = pair.activeOverlapPct;
      const edgeWidth = Math.max(1.5, ((pct - 45) / 55) * 6.5);

      edgesArray.push({
        id: `${pair.degree.title}|||${pair.cert.title}`,
        from: pair.cert.title,
        to: pair.degree.title,
        width: edgeWidth,
        label: `${pct.toFixed(0)}%`,
        title: `${pair.cert.title} → ${pair.degree.title}\nOverlap: ${pct.toFixed(1)}% (${pair.sharedCount}/${pair.certCourseCount} courses)`,
        arrows: {
          to: {
            enabled: state.filters.metricMode === 'directional',
            scaleFactor: 0.55
          }
        },
        color: {
          color: pair.isEmbeddedMilestone
            ? '#D97706'
            : isDark
            ? 'rgba(248, 113, 113, 0.65)'
            : 'rgba(153, 0, 0, 0.55)',
          highlight: '#990000'
        },
        font: {
          size: 10,
          color: isDark ? '#CBD5E1' : '#4B5563',
          strokeWidth: 0,
          align: 'middle'
        }
      });
    }

    const data = {
      nodes: new vis.DataSet(nodesArray),
      edges: new vis.DataSet(edgesArray)
    };

    const options = {
      physics: {
        enabled: state.networkPhysicsEnabled,
        barnesHut: {
          gravitationalConstant: -4200,
          centralGravity: 0.28,
          springLength: 145,
          springConstant: 0.04,
          damping: 0.12
        },
        stabilization: { iterations: 120 }
      },
      interaction: {
        hover: true,
        tooltipDelay: 120,
        navigationButtons: false,
        keyboard: true
      }
    };

    if (state.networkInstance) {
      state.networkInstance.destroy();
    }

    state.networkInstance = new vis.Network(dom.networkCanvas, data, options);

    state.networkInstance.on('click', function (params) {
      if (params.nodes && params.nodes.length > 0) {
        const selectedNodeId = params.nodes[0];
        renderNetworkNodeInspector(selectedNodeId);
      } else if (params.edges && params.edges.length > 0) {
        const edgeId = params.edges[0];
        const pair = state.pairLookupMap.get(edgeId);
        if (pair) {
          openPairComparisonModal(pair.degree.title, pair.cert.title);
        }
      } else {
        dom.inspectorEmptyState.classList.remove('hidden');
        dom.inspectorContent.classList.add('hidden');
      }
    });
  }

  function renderNetworkNodeInspector(programTitle) {
    const prog = state.programsMap.get(programTitle);
    if (!prog) return;

    dom.inspectorEmptyState.classList.add('hidden');
    dom.inspectorContent.classList.remove('hidden');

    // Find all qualifying pairs connected to this program
    const connectedPairs = state.allQualifyingPairs
      .filter((p) => p.degree.title === programTitle || p.cert.title === programTitle)
      .sort((a, b) => b.activeOverlapPct - a.activeOverlapPct);

    const neighborsHtml = connectedPairs.length
      ? connectedPairs
          .map((pair) => {
            const otherProg = prog.tier === 'Degree' ? pair.cert : pair.degree;
            return `
              <div class="inspector-neighbor-item js-open-pair-modal"
                   data-degree="${escapeHtml(pair.degree.title)}"
                   data-cert="${escapeHtml(pair.cert.title)}">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
                  <strong style="font-size:0.8rem;">${escapeHtml(otherProg.title)}</strong>
                  <span class="overlap-pct-badge ${getOverlapBadgeClass(
                    pair.activeOverlapPct,
                    pair.isEmbeddedMilestone
                  )}">${pair.activeOverlapPct.toFixed(0)}%</span>
                </div>
                <div style="font-size:0.73rem; color:var(--text-secondary); margin-top:0.25rem;">
                  ${pair.sharedCount}/${pair.certCourseCount} cert courses shared (${pair.sharedUnits} u) &bull; Click for Gap Checklist
                </div>
              </div>
            `;
          })
          .join('')
      : `<div class="control-hint">No connected programs at ≥${state.filters.threshold}% threshold.</div>`;

    dom.inspectorContent.innerHTML = `
      <div class="family-badges-row">
        <span class="tier-pill ${prog.tier === 'Degree' ? 'tier-degree' : 'tier-cert'}">${
      prog.tier
    }</span>
        <span class="status-pill status-pill-${prog.status.replace(/\s+/g, '')}">${escapeHtml(
      prog.status
    )}</span>
      </div>
      <h3 style="margin:0.3rem 0; font-size:1rem;">${escapeHtml(prog.title)}</h3>
      <div style="font-size:0.77rem; color:var(--text-secondary); margin-bottom:0.75rem;">
        <strong>${prog.coursesList.length}</strong> Unique Courses &bull;
        <strong>${prog.totalUnits}</strong> Min Units &bull;
        ${escapeHtml(prog.primaryDiscipline)}
      </div>
      <button type="button" class="btn btn-ghost btn-xs js-inspect-program" data-program="${escapeHtml(
        prog.title
      )}" style="width:100%; margin-bottom:0.85rem;">
        View Full Course List &amp; PLOs
      </button>

      <div style="font-size:0.76rem; font-weight:700; text-transform:uppercase; color:var(--text-muted);">
        Connected Pathways (${connectedPairs.length})
      </div>
      <div class="inspector-neighbor-list">
        ${neighborsHtml}
      </div>
    `;
  }

  /* ------------------------------------------------------------------------
   * 8. VIEW 3: OVERLAP CROSSWALK MATRIX (HEATMAP GRID)
   * ------------------------------------------------------------------------ */

  function getMatrixCellStyle(pct, isEmbedded) {
    if (!pct || pct <= 0) return '';
    if (isEmbedded || pct >= 99.95) {
      return 'background-color: #D97706; color: #FFFFFF;';
    }
    if (pct >= 80) {
      return 'background-color: #990000; color: #FFFFFF;';
    }
    if (pct >= 50) {
      return 'background-color: rgba(153, 0, 0, 0.48); color: #FFFFFF;';
    }
    const alpha = Math.max(0.08, (pct / 50) * 0.25).toFixed(2);
    return `background-color: rgba(153, 0, 0, ${alpha});`;
  }

  function renderCrosswalkMatrixView() {
    const scope = state.filters.matrixScope;
    let degrees = [];
    let certs = [];

    if (scope === 'matching') {
      const degSet = new Set();
      const certSet = new Set();
      for (const pair of state.allQualifyingPairs) {
        degSet.add(pair.degree);
        certSet.add(pair.cert);
      }
      degrees = Array.from(degSet).sort((a, b) => a.title.localeCompare(b.title));
      certs = Array.from(certSet).sort((a, b) => a.title.localeCompare(b.title));
    } else if (scope === 'top35') {
      degrees = state.programFamilies
        .slice(0, 35)
        .map((f) => f.degree);
      const certFreq = new Map();
      for (const pair of state.allQualifyingPairs) {
        certFreq.set(pair.cert, (certFreq.get(pair.cert) || 0) + 1);
      }
      certs = Array.from(certFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 35)
        .map((entry) => entry[0]);
    } else {
      degrees = [...state.filteredDegrees].sort((a, b) => a.title.localeCompare(b.title));
      certs = [...state.filteredCerts].sort((a, b) => a.title.localeCompare(b.title));
    }

    dom.matrixDimensionsBadge.textContent = `${degrees.length} Degrees × ${certs.length} Certificates`;

    if (degrees.length === 0 || certs.length === 0) {
      dom.matrixScrollContainer.innerHTML = `
        <div class="empty-state-box">
          <h3>No Matrix Cells to Display</h3>
          <p>Lower the overlap threshold or switch Matrix Scope to "All Filtered Degrees × Certificates".</p>
        </div>
      `;
      return;
    }

    const colHeadersHtml = certs
      .map(
        (c) => `
        <th title="${escapeHtml(c.title)} (${c.coursesList.length} courses, ${c.totalUnits} u)">
          <div class="rotated-col-header">${escapeHtml(truncateText(c.title, 36))}</div>
        </th>`
      )
      .join('');

    const rowsHtml = degrees
      .map((d) => {
        const cells = certs
          .map((c) => {
            const pair = state.pairLookupMap.get(`${d.title}|||${c.title}`);
            if (!pair || pair.sharedCount === 0) {
              return `<td class="matrix-cell matrix-cell-empty">&middot;</td>`;
            }
            const pct = pair.activeOverlapPct;
            const style = getMatrixCellStyle(pct, pair.isEmbeddedMilestone);
            return `
              <td class="matrix-cell js-open-pair-modal"
                  style="${style}"
                  data-degree="${escapeHtml(d.title)}"
                  data-cert="${escapeHtml(c.title)}"
                  title="${escapeHtml(d.title)} × ${escapeHtml(c.title)}&#10;Overlap: ${pct.toFixed(
              1
            )}% (${pair.sharedCount}/${pair.certCourseCount} cert courses shared)">
                ${pct.toFixed(0)}%
              </td>
            `;
          })
          .join('');

        return `
          <tr>
            <th class="row-header" title="${escapeHtml(d.title)} (${d.coursesList.length} courses, ${
          d.totalUnits
        } u)">
              ${escapeHtml(d.title)}
            </th>
            ${cells}
          </tr>
        `;
      })
      .join('');

    dom.matrixScrollContainer.innerHTML = `
      <table class="crosswalk-matrix-table">
        <thead>
          <tr>
            <th class="corner-header">Associate Degree (Rows) \\ Certificate (Cols)</th>
            ${colHeadersHtml}
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  }

  /* ------------------------------------------------------------------------
   * 9. MODAL DIALOGS (PAIR COMPARISON & SINGLE PROGRAM PLO/COURSE INSPECTOR)
   * ------------------------------------------------------------------------ */

  function openPairComparisonModal(degreeTitle, certTitle) {
    let pair = state.pairLookupMap.get(`${degreeTitle}|||${certTitle}`);
    if (!pair) {
      const d = state.programsMap.get(degreeTitle);
      const c = state.programsMap.get(certTitle);
      if (!d || !c) return;
      pair = computePairOverlap(d, c);
    }

    dom.modalEyebrow.textContent = 'Stackable Pathway & Course Gap Checklist';
    dom.modalTitle.textContent = `${pair.cert.title} → ${pair.degree.title}`;
    dom.modalBodyContent.innerHTML = buildCourseGapChecklistHtml(pair, true);
    dom.comparisonModalBackdrop.classList.remove('hidden');
  }

  function openSingleProgramModal(programTitle) {
    const prog = state.programsMap.get(programTitle);
    if (!prog) return;

    dom.modalEyebrow.textContent = `${prog.tier} Curriculum & Program Learning Outcomes`;
    dom.modalTitle.textContent = prog.title;

    const plosHtml = prog.plosList.length
      ? `<ul style="margin:0.4rem 0 0; padding-left:1.25rem; font-size:0.8rem; color:var(--text-secondary);">
          ${prog.plosList.map((plo) => `<li style="margin-bottom:0.35rem;">${escapeHtml(plo)}</li>`).join('')}
         </ul>`
      : `<div class="control-hint">No Program Learning Outcomes listed in dataset.</div>`;

    const coursesRowsHtml = prog.coursesList
      .map(
        (c) => `
        <tr>
          <td style="padding:0.45rem 0.6rem; font-family:var(--font-mono); font-weight:700; border-bottom:1px solid var(--border-color);">${escapeHtml(
            c.courseId
          )}</td>
          <td style="padding:0.45rem 0.6rem; border-bottom:1px solid var(--border-color);">${escapeHtml(
            c.courseTitle
          )}</td>
          <td style="padding:0.45rem 0.6rem; border-bottom:1px solid var(--border-color); font-size:0.75rem; color:var(--text-secondary);">${escapeHtml(
            c.discipline
          )}</td>
          <td style="padding:0.45rem 0.6rem; border-bottom:1px solid var(--border-color); font-size:0.74rem; color:var(--text-secondary);">${escapeHtml(
            c.blockTitle
          )}</td>
          <td style="padding:0.45rem 0.6rem; font-family:var(--font-mono); text-align:right; border-bottom:1px solid var(--border-color);">${
            c.minUnits
          }</td>
        </tr>`
      )
      .join('');

    dom.modalBodyContent.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:1rem;">
        <div class="unit-tally-grid">
          <div class="tally-box tally-box-green">
            <div class="tally-label">Lifecycle Status</div>
            <div class="tally-val">${escapeHtml(prog.status)}</div>
            <div class="tally-sub">Effective: ${escapeHtml(prog.implementationDate || 'N/A')}</div>
          </div>
          <div class="tally-box tally-box-blue">
            <div class="tally-label">Unique Courses</div>
            <div class="tally-val">${prog.coursesList.length} Courses</div>
            <div class="tally-sub">Deduplicated from PLO rows</div>
          </div>
          <div class="tally-box tally-box-gold">
            <div class="tally-label">Total Minimum Units</div>
            <div class="tally-val">${prog.totalUnits} Units</div>
            <div class="tally-sub">${escapeHtml(prog.primaryDiscipline)}</div>
          </div>
          <div class="tally-box tally-box-orange">
            <div class="tally-label">State / Local Codes</div>
            <div class="tally-val">${escapeHtml(prog.localCode || prog.controlNumber || '—')}</div>
            <div class="tally-sub">Control #: ${escapeHtml(prog.controlNumber || '—')}</div>
          </div>
        </div>

        ${
          prog.description
            ? `<div style="background:var(--bg-elevated); padding:0.85rem 1rem; border-radius:var(--radius-sm); border:1px solid var(--border-color); font-size:0.82rem; color:var(--text-secondary);">
                 <strong style="color:var(--text-primary); display:block; margin-bottom:0.25rem;">Catalog Program Description</strong>
                 ${escapeHtml(prog.description)}
               </div>`
            : ''
        }

        <div style="background:var(--bg-elevated); padding:0.85rem 1rem; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
          <strong style="font-size:0.84rem;">Program Learning Outcomes (${prog.plosList.length} Distinct PLOs)</strong>
          ${plosHtml}
        </div>

        <div>
          <strong style="font-size:0.86rem; display:block; margin-bottom:0.5rem;">Deduplicated Course Requirements (${
            prog.coursesList.length
          })</strong>
          <div style="max-height:340px; overflow-y:auto; border:1px solid var(--border-color); border-radius:var(--radius-sm);">
            <table style="width:100%; border-collapse:collapse; font-size:0.79rem;">
              <thead style="background:var(--bg-elevated); position:sticky; top:0;">
                <tr>
                  <th style="text-align:left; padding:0.5rem 0.6rem; border-bottom:1px solid var(--border-strong);">Course ID</th>
                  <th style="text-align:left; padding:0.5rem 0.6rem; border-bottom:1px solid var(--border-strong);">Course Title</th>
                  <th style="text-align:left; padding:0.5rem 0.6rem; border-bottom:1px solid var(--border-strong);">Discipline</th>
                  <th style="text-align:left; padding:0.5rem 0.6rem; border-bottom:1px solid var(--border-strong);">Course Block</th>
                  <th style="text-align:right; padding:0.5rem 0.6rem; border-bottom:1px solid var(--border-strong);">Min Units</th>
                </tr>
              </thead>
              <tbody>
                ${coursesRowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    dom.comparisonModalBackdrop.classList.remove('hidden');
  }

  /* ------------------------------------------------------------------------
   * 10. EXPORT FUNCTIONALITY (CSV CROSSWALK & EXECUTIVE PDF REPORT)
   * ------------------------------------------------------------------------ */

  /**
   * Generates and downloads a clean tabular CSV export of all filtered
   * Degree-Certificate overlap pathways.
   */
  function exportCrosswalkCsv() {
    const pairs = state.allQualifyingPairs;
    if (pairs.length === 0) {
      alert('No qualifying Degree-Certificate pairs to export at the current filter settings.');
      return;
    }

    const headers = [
      'Degree Title',
      'Degree Status',
      'Degree Primary Discipline',
      'Degree Total Courses',
      'Degree Total Min Units',
      'Certificate Title',
      'Certificate Status',
      'Certificate Primary Discipline',
      'Certificate Total Courses',
      'Certificate Total Min Units',
      'Overlap % (Cert Embedded in Degree)',
      'Jaccard Bidirectional Similarity %',
      'Overlapping Units %',
      'Degree Completion Contribution %',
      'Shared Courses Count',
      'Shared Units',
      'Certificate Additional Courses Count',
      'Certificate Additional Units Needed',
      'Shared Course List',
      'Certificate Additional Courses Needed'
    ];

    const csvRows = [headers.join(',')];

    for (const p of pairs) {
      const sharedListStr = p.sharedCourses.map((c) => `${c.courseId} (${c.minUnits}u)`).join('; ');
      const gapListStr =
        p.certGapCourses.length > 0
          ? p.certGapCourses.map((c) => `${c.courseId} (${c.minUnits}u)`).join('; ')
          : 'None (100% Embedded Milestone)';

      const rowValues = [
        p.degree.title,
        p.degree.status,
        p.degree.primaryDiscipline,
        p.degree.coursesList.length,
        p.degree.totalUnits,
        p.cert.title,
        p.cert.status,
        p.cert.primaryDiscipline,
        p.cert.coursesList.length,
        p.cert.totalUnits,
        p.stackableOverlapPct.toFixed(2),
        p.jaccardOverlapPct.toFixed(2),
        p.overlappingUnitsPct.toFixed(2),
        p.degreeContributionPct.toFixed(2),
        p.sharedCount,
        p.sharedUnits,
        p.certGapCourses.length,
        p.certAdditionalUnits,
        sharedListStr,
        gapListStr
      ].map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`);

      csvRows.push(rowValues.join(','));
    }

    const blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Chaffey_Program_Overlap_Crosswalk_${state.filters.threshold}pct.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Generates a formatted Executive Summary PDF Report of the currently filtered
   * Program Families and Stackable Pathways using html2pdf.js.
   */
  function exportFamilyReportPdf() {
    const familiesWithCerts = state.programFamilies.filter((f) => f.qualifyingCerts.length > 0);
    if (familiesWithCerts.length === 0) {
      alert('No Program Families with qualifying certificates to export.');
      return;
    }

    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const familyBlocksHtml = familiesWithCerts
      .map((fam) => {
        const rows = fam.qualifyingCerts
          .map(
            (p) => `
            <tr>
              <td style="padding:6px 8px; border-bottom:1px solid #E5E7EB; font-weight:600;">
                ${escapeHtml(p.cert.title)}
                ${
                  p.isEmbeddedMilestone
                    ? '<span style="color:#D97706; font-size:10px; font-weight:700;"> [100% MILESTONE]</span>'
                    : ''
                }
              </td>
              <td style="padding:6px 8px; border-bottom:1px solid #E5E7EB; text-align:center; font-weight:700; color:#990000;">
                ${p.activeOverlapPct.toFixed(1)}%
              </td>
              <td style="padding:6px 8px; border-bottom:1px solid #E5E7EB; text-align:center;">
                ${p.sharedCount} / ${p.certCourseCount} (${p.sharedUnits} u)
              </td>
              <td style="padding:6px 8px; border-bottom:1px solid #E5E7EB; text-align:center;">
                ${p.degreeContributionPct.toFixed(1)}%
              </td>
              <td style="padding:6px 8px; border-bottom:1px solid #E5E7EB; font-size:11px; color:#4B5563;">
                ${
                  p.certGapCourses.length === 0
                    ? '<strong style="color:#059669;">0 extra courses needed</strong>'
                    : escapeHtml(p.certGapCourses.map((c) => c.courseId).join(', '))
                }
              </td>
            </tr>`
          )
          .join('');

        return `
          <div class="pdf-family-block">
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
              <h3 style="margin:0; font-size:14px; color:#990000;">${escapeHtml(
                fam.degree.title
              )}</h3>
              <span style="font-size:11px; color:#4B5563;">
                ${fam.degree.coursesList.length} Courses &bull; ${
          fam.degree.totalUnits
        } Min Units &bull; ${escapeHtml(fam.degree.primaryDiscipline)}
              </span>
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:11.5px;">
              <thead>
                <tr style="background:#F3F4F6; text-align:left;">
                  <th style="padding:5px 8px; border-bottom:1px solid #D1D5DB;">Stackable Certificate</th>
                  <th style="padding:5px 8px; border-bottom:1px solid #D1D5DB; text-align:center;">Overlap %</th>
                  <th style="padding:5px 8px; border-bottom:1px solid #D1D5DB; text-align:center;">Shared Courses</th>
                  <th style="padding:5px 8px; border-bottom:1px solid #D1D5DB; text-align:center;">Degree Contrib.</th>
                  <th style="padding:5px 8px; border-bottom:1px solid #D1D5DB;">Remaining Cert Gap Courses</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        `;
      })
      .join('');

    dom.pdfReportContent.innerHTML = `
      <div class="pdf-header">
        <div>
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#990000; letter-spacing:0.06em;">
            Chaffey College &bull; Office of Institutional Research
          </div>
          <h1 style="margin:4px 0 0; font-size:20px; color:#111827;">
            Stackable Program Families &amp; Curriculum Overlap Executive Report
          </h1>
        </div>
        <div style="text-align:right; font-size:11px; color:#4B5563;">
          <div>Generated: ${escapeHtml(dateStr)}</div>
          <div>Threshold: &ge;${state.filters.threshold}% (${
      state.filters.metricMode === 'jaccard' ? 'Jaccard' : 'Directional'
    })</div>
          <div>Statuses: ${escapeHtml(Array.from(state.filters.statuses).join(', '))}</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-bottom:18px;">
        <div style="padding:10px; background:#F9FAFB; border:1px solid #E5E7EB; border-radius:6px;">
          <div style="font-size:10px; text-transform:uppercase; color:#6B7280; font-weight:700;">Program Families</div>
          <div style="font-size:18px; font-weight:800; color:#990000;">${familiesWithCerts.length}</div>
        </div>
        <div style="padding:10px; background:#F9FAFB; border:1px solid #E5E7EB; border-radius:6px;">
          <div style="font-size:10px; text-transform:uppercase; color:#6B7280; font-weight:700;">Stackable Pathways</div>
          <div style="font-size:18px; font-weight:800; color:#111827;">${
            state.allQualifyingPairs.length
          }</div>
        </div>
        <div style="padding:10px; background:#F9FAFB; border:1px solid #E5E7EB; border-radius:6px;">
          <div style="font-size:10px; text-transform:uppercase; color:#6B7280; font-weight:700;">100% Embedded Milestones</div>
          <div style="font-size:18px; font-weight:800; color:#D97706;">${
            state.allQualifyingPairs.filter((p) => p.isEmbeddedMilestone).length
          }</div>
        </div>
        <div style="padding:10px; background:#F9FAFB; border:1px solid #E5E7EB; border-radius:6px;">
          <div style="font-size:10px; text-transform:uppercase; color:#6B7280; font-weight:700;">Filtered Programs</div>
          <div style="font-size:18px; font-weight:800; color:#111827;">${
            state.filteredDegrees.length + state.filteredCerts.length
          }</div>
        </div>
      </div>

      ${familyBlocksHtml}
    `;

    if (typeof html2pdf === 'undefined') {
      window.print();
      return;
    }

    const opt = {
      margin: [0.35, 0.35, 0.35, 0.35],
      filename: `Chaffey_Program_Families_Report_${state.filters.threshold}pct.pdf`,
      image: { type: 'jpeg', quality: 0.96 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(dom.pdfReportContent).save();
  }

  /* ------------------------------------------------------------------------
   * 11. DISCIPLINE MULTI-SELECT DROPDOWN HELPERS
   * ------------------------------------------------------------------------ */

  function renderDisciplineDropdownOptions() {
    const query = dom.disciplineSearchInput.value.trim().toLowerCase();
    const listHtml = state.allDisciplines
      .filter((d) => !query || d.toLowerCase().includes(query))
      .map((disc) => {
        const checked = state.filters.disciplines.has(disc) ? 'checked' : '';
        return `
          <label class="discipline-option-row">
            <div class="discipline-option-left">
              <input type="checkbox" class="js-discipline-check" value="${escapeHtml(
                disc
              )}" ${checked} />
              <span title="${escapeHtml(disc)}">${escapeHtml(disc)}</span>
            </div>
          </label>
        `;
      })
      .join('');

    dom.disciplineOptionsList.innerHTML =
      listHtml || `<div class="control-hint" style="padding:0.4rem;">No matching disciplines</div>`;

    updateDisciplineSummaryLabel();
  }

  function updateDisciplineSummaryLabel() {
    const selectedCount = state.filters.disciplines.size;
    const totalCount = state.allDisciplines.length;

    if (selectedCount === totalCount) {
      dom.disciplineTriggerLabel.textContent = `All Disciplines (${totalCount})`;
      dom.disciplineSelectionCount.textContent = 'All Selected';
    } else if (selectedCount === 0) {
      dom.disciplineTriggerLabel.textContent = 'No Disciplines Selected';
      dom.disciplineSelectionCount.textContent = '0 Selected';
    } else if (selectedCount === 1) {
      dom.disciplineTriggerLabel.textContent = Array.from(state.filters.disciplines)[0];
      dom.disciplineSelectionCount.textContent = `1 of ${totalCount}`;
    } else {
      dom.disciplineTriggerLabel.textContent = `${selectedCount} Disciplines Selected`;
      dom.disciplineSelectionCount.textContent = `${selectedCount} of ${totalCount}`;
    }
  }

  /* ------------------------------------------------------------------------
   * 12. CSV INGESTION & INITIALIZATION
   * ------------------------------------------------------------------------ */

  function updateStatusIndicator(stateType, message) {
    dom.dataStatusDot.className = `status-dot ${stateType}`;
    dom.dataStatusText.textContent = message;
  }

  function parseCsvText(csvText, sourceLabel) {
    updateStatusIndicator('loading', `Parsing ${sourceLabel}...`);

    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: function (results) {
        if (!results.data || results.data.length === 0) {
          updateStatusIndicator('error', 'CSV file contained no valid rows');
          return;
        }
        indexRawDatasetMetadata(results.data);
        runAnalysisPipeline();
        updateStatusIndicator(
          'ready',
          `${sourceLabel} (${results.data.length.toLocaleString()} rows → ${
            state.programsMap.size
          } active programs)`
        );
      },
      error: function (err) {
        updateStatusIndicator('error', `Parse error: ${err.message}`);
      }
    });
  }

  function loadDefaultCsvFile() {
    updateStatusIndicator('loading', 'Fetching Program Summary.csv...');
    fetch('./Program Summary.csv')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.text();
      })
      .then((csvText) => {
        parseCsvText(csvText, 'Program Summary.csv');
      })
      .catch(() => {
        updateStatusIndicator(
          'error',
          'Click "Load CSV" to select Program Summary.csv'
        );
        dom.familyCardsContainer.innerHTML = `
          <div class="empty-state-box">
            <h3>Load "Program Summary.csv" to Begin Analysis</h3>
            <p>Your browser blocked automatic local file fetching (common when opening HTML directly via <code>file://</code>). Click the <strong>Load CSV</strong> button in the top navigation bar and select <strong>Program Summary.csv</strong>.</p>
          </div>
        `;
      });
  }

  /* ------------------------------------------------------------------------
   * 13. EVENT LISTENERS & UI BINDINGS
   * ------------------------------------------------------------------------ */

  function truncateText(str, maxLen) {
    const s = String(str || '');
    return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
  }

  function syncPresetPills(thresholdVal) {
    dom.presetPills.forEach((pill) => {
      const pVal = parseInt(pill.getAttribute('data-threshold'), 10);
      pill.classList.toggle('active', pVal === thresholdVal);
    });
  }

  function bindEvents() {
    // Theme Toggle
    dom.themeToggleBtn.addEventListener('click', () => {
      const htmlEl = document.documentElement;
      const nextTheme = htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      htmlEl.setAttribute('data-theme', nextTheme);
      localStorage.setItem('chaffey_overlap_theme', nextTheme);
      if (state.activeView === 'network') {
        renderNetworkClusterView();
      }
    });

    // CSV File Input Upload
    dom.csvFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        state.expandedFamilies.clear();
        state.selectedCertByDegree.clear();
        parseCsvText(evt.target.result, file.name);
      };
      reader.readAsText(file);
    });

    // Export Buttons
    dom.exportCsvBtn.addEventListener('click', exportCrosswalkCsv);
    dom.exportPdfBtn.addEventListener('click', exportFamilyReportPdf);

    // Search Input (with fast debounce)
    let searchTimeout = null;
    dom.searchInput.addEventListener('input', () => {
      const val = dom.searchInput.value;
      dom.clearSearchBtn.classList.toggle('hidden', !val);
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        state.filters.searchQuery = val;
        runAnalysisPipeline();
      }, 150);
    });

    dom.clearSearchBtn.addEventListener('click', () => {
      dom.searchInput.value = '';
      dom.clearSearchBtn.classList.add('hidden');
      state.filters.searchQuery = '';
      runAnalysisPipeline();
    });

    // Threshold Slider & Preset Pills
    dom.thresholdSlider.addEventListener('input', () => {
      const val = parseInt(dom.thresholdSlider.value, 10);
      dom.thresholdValueDisplay.textContent = `${val}%`;
      state.filters.threshold = val;
      syncPresetPills(val);
      runAnalysisPipeline();
    });

    dom.presetPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const val = parseInt(pill.getAttribute('data-threshold'), 10);
        dom.thresholdSlider.value = val;
        dom.thresholdValueDisplay.textContent = `${val}%`;
        state.filters.threshold = val;
        syncPresetPills(val);
        runAnalysisPipeline();
      });
    });

    // Stackability Direction Toggle
    function setMetricMode(mode) {
      state.filters.metricMode = mode;
      dom.metricDirectionalBtn.classList.toggle('active', mode === 'directional');
      dom.metricJaccardBtn.classList.toggle('active', mode === 'jaccard');

      if (mode === 'directional') {
        dom.formulaCallout.innerHTML = `
          <code>Overlap % = |S<sub>D</sub> &cap; S<sub>C</sub>| / |S<sub>C</sub>| &times; 100</code>
          <span>Measures how much of Certificate C is embedded inside Degree D.</span>
        `;
      } else {
        dom.formulaCallout.innerHTML = `
          <code>Jaccard % = |S<sub>D</sub> &cap; S<sub>C</sub>| / |S<sub>D</sub> &cup; S<sub>C</sub>| &times; 100</code>
          <span>Symmetric bidirectional course similarity across both programs.</span>
        `;
      }
      runAnalysisPipeline();
    }

    dom.metricDirectionalBtn.addEventListener('click', () => setMetricMode('directional'));
    dom.metricJaccardBtn.addEventListener('click', () => setMetricMode('jaccard'));

    // Lifecycle Status Checkboxes
    dom.statusCheckboxes.forEach((cb) => {
      cb.addEventListener('change', () => {
        const nextStatuses = new Set();
        dom.statusCheckboxes.forEach((box) => {
          if (box.checked) nextStatuses.add(box.value);
        });
        // Prevent unchecking all statuses
        if (nextStatuses.size === 0) {
          cb.checked = true;
          nextStatuses.add(cb.value);
        }
        state.filters.statuses = nextStatuses;
        runAnalysisPipeline();
      });
    });

    dom.statusActiveOnlyBtn.addEventListener('click', () => {
      state.filters.statuses = new Set(['Active']);
      dom.statusCheckboxes.forEach((box) => {
        box.checked = box.value === 'Active';
      });
      runAnalysisPipeline();
    });

    // Discipline Dropdown Menu
    dom.disciplineDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = dom.disciplineDropdownMenu.classList.toggle('hidden');
      dom.disciplineDropdownBtn.setAttribute('aria-expanded', String(!isHidden));
    });

    document.addEventListener('click', (e) => {
      if (!dom.disciplineDropdown.contains(e.target)) {
        dom.disciplineDropdownMenu.classList.add('hidden');
        dom.disciplineDropdownBtn.setAttribute('aria-expanded', 'false');
      }
    });

    dom.disciplineSearchInput.addEventListener('input', renderDisciplineDropdownOptions);

    dom.disciplineOptionsList.addEventListener('change', (e) => {
      if (e.target.classList.contains('js-discipline-check')) {
        const disc = e.target.value;
        if (e.target.checked) {
          state.filters.disciplines.add(disc);
        } else {
          state.filters.disciplines.delete(disc);
        }
        updateDisciplineSummaryLabel();
        runAnalysisPipeline();
      }
    });

    dom.selectAllDisciplinesBtn.addEventListener('click', () => {
      state.filters.disciplines = new Set(state.allDisciplines);
      renderDisciplineDropdownOptions();
      runAnalysisPipeline();
    });

    dom.clearAllDisciplinesBtn.addEventListener('click', () => {
      state.filters.disciplines.clear();
      renderDisciplineDropdownOptions();
      runAnalysisPipeline();
    });

    // Sort & Display Toggles
    dom.sortBySelect.addEventListener('change', () => {
      state.filters.sortBy = dom.sortBySelect.value;
      runAnalysisPipeline();
    });

    dom.onlyWithCertsToggle.addEventListener('change', () => {
      state.filters.onlyWithCerts = dom.onlyWithCertsToggle.checked;
      runAnalysisPipeline();
    });

    dom.excludeGeToggle.addEventListener('change', () => {
      state.filters.excludeGe = dom.excludeGeToggle.checked;
      runAnalysisPipeline();
    });

    // Reset All Filters
    dom.resetFiltersBtn.addEventListener('click', () => {
      state.filters.searchQuery = '';
      state.filters.threshold = 80;
      state.filters.metricMode = 'directional';
      state.filters.statuses = new Set(['Active']);
      state.filters.disciplines = new Set(state.allDisciplines);
      state.filters.sortBy = 'certCount';
      state.filters.onlyWithCerts = true;
      state.filters.excludeGe = false;

      dom.searchInput.value = '';
      dom.clearSearchBtn.classList.add('hidden');
      dom.thresholdSlider.value = 80;
      dom.thresholdValueDisplay.textContent = '80%';
      syncPresetPills(80);
      dom.statusCheckboxes.forEach((box) => {
        box.checked = box.value === 'Active';
      });
      dom.sortBySelect.value = 'certCount';
      dom.onlyWithCertsToggle.checked = true;
      dom.excludeGeToggle.checked = false;
      renderDisciplineDropdownOptions();
      setMetricMode('directional');
    });

    // View Mode Switcher Tabs
    dom.viewTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const targetView = tab.getAttribute('data-view');
        state.activeView = targetView;

        dom.viewTabs.forEach((t) => {
          const isMatch = t.getAttribute('data-view') === targetView;
          t.classList.toggle('active', isMatch);
          t.setAttribute('aria-selected', String(isMatch));
        });

        dom.viewFamilies.classList.toggle('hidden', targetView !== 'families');
        dom.viewNetwork.classList.toggle('hidden', targetView !== 'network');
        dom.viewMatrix.classList.toggle('hidden', targetView !== 'matrix');
        dom.familyBulkActions.classList.toggle('hidden', targetView !== 'families');

        renderActiveView();
      });
    });

    // Expand / Collapse All Family Cards
    dom.expandAllFamiliesBtn.addEventListener('click', () => {
      for (const fam of state.programFamilies) {
        state.expandedFamilies.add(fam.degree.title);
      }
      renderFamilyExplorerView();
    });

    dom.collapseAllFamiliesBtn.addEventListener('click', () => {
      state.expandedFamilies.clear();
      renderFamilyExplorerView();
    });

    // Delegated Clicks inside Family Cards Container
    dom.familyCardsContainer.addEventListener('click', (e) => {
      const inspectBtn = e.target.closest('.js-inspect-program');
      if (inspectBtn) {
        e.stopPropagation();
        openSingleProgramModal(inspectBtn.getAttribute('data-program'));
        return;
      }

      const openPairBtn = e.target.closest('.js-open-pair-modal');
      if (openPairBtn) {
        e.stopPropagation();
        openPairComparisonModal(
          openPairBtn.getAttribute('data-degree'),
          openPairBtn.getAttribute('data-cert')
        );
        return;
      }

      const certCard = e.target.closest('.cert-milestone-card');
      if (certCard) {
        const degTitle = certCard.getAttribute('data-degree');
        const certTitle = certCard.getAttribute('data-cert');
        const currentSelected = state.selectedCertByDegree.get(degTitle);
        if (currentSelected === certTitle) {
          state.selectedCertByDegree.delete(degTitle);
        } else {
          state.selectedCertByDegree.set(degTitle, certTitle);
        }
        renderFamilyExplorerView();
        return;
      }

      const headerToggle = e.target.closest('.js-toggle-family');
      if (headerToggle) {
        const degTitle = headerToggle.getAttribute('data-degree');
        if (state.expandedFamilies.has(degTitle)) {
          state.expandedFamilies.delete(degTitle);
        } else {
          state.expandedFamilies.add(degTitle);
        }
        renderFamilyExplorerView();
      }
    });

    // Network Toolbar Controls
    dom.networkHideIsolatedToggle.addEventListener('change', () => {
      state.filters.networkHideIsolated = dom.networkHideIsolatedToggle.checked;
      renderNetworkClusterView();
    });

    dom.networkPhysicsBtn.addEventListener('click', () => {
      state.networkPhysicsEnabled = !state.networkPhysicsEnabled;
      dom.networkPhysicsBtn.textContent = state.networkPhysicsEnabled
        ? 'Pause Layout'
        : 'Resume Layout';
      if (state.networkInstance) {
        state.networkInstance.setOptions({ physics: { enabled: state.networkPhysicsEnabled } });
      }
    });

    dom.networkFitBtn.addEventListener('click', () => {
      if (state.networkInstance) {
        state.networkInstance.fit({ animation: true });
      }
    });

    dom.inspectorContent.addEventListener('click', (e) => {
      const pairItem = e.target.closest('.js-open-pair-modal');
      if (pairItem) {
        openPairComparisonModal(
          pairItem.getAttribute('data-degree'),
          pairItem.getAttribute('data-cert')
        );
        return;
      }
      const progBtn = e.target.closest('.js-inspect-program');
      if (progBtn) {
        openSingleProgramModal(progBtn.getAttribute('data-program'));
      }
    });

    // Matrix Controls & Cell Clicks
    dom.matrixScopeSelect.addEventListener('change', () => {
      state.filters.matrixScope = dom.matrixScopeSelect.value;
      renderCrosswalkMatrixView();
    });

    dom.matrixScrollContainer.addEventListener('click', (e) => {
      const cell = e.target.closest('.js-open-pair-modal');
      if (cell) {
        openPairComparisonModal(
          cell.getAttribute('data-degree'),
          cell.getAttribute('data-cert')
        );
      }
    });

    // Modal Close Events
    dom.closeModalBtn.addEventListener('click', () => {
      dom.comparisonModalBackdrop.classList.add('hidden');
    });

    dom.comparisonModalBackdrop.addEventListener('click', (e) => {
      if (e.target === dom.comparisonModalBackdrop) {
        dom.comparisonModalBackdrop.classList.add('hidden');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dom.comparisonModalBackdrop.classList.contains('hidden')) {
        dom.comparisonModalBackdrop.classList.add('hidden');
      }
    });
  }

  /* ------------------------------------------------------------------------
   * 14. BOOTSTRAP ON DOM CONTENT LOADED
   * ------------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('chaffey_overlap_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }

    cacheDomReferences();
    bindEvents();
    loadDefaultCsvFile();
  });
})();
