/**
 * ============================================================================
 * Chaffey College | Curriculum Overlap & Stackable Pathway Explorer (app.js)
 * ============================================================================
 * Client-Side Single-Page Application (SPA) for Higher Education Institutional
 * Research & Curriculum Pathway Analytics.
 *
 * Key Analytical Pipeline:
 * 1. Active-Only Curriculum Scope:
 *    Strictly filters `Program Summary.csv` to `Program Status === 'Active'`.
 * 2. Cartesian Product Deduplication:
 *    Deduplicates rows flattened at [Program Entity Title] x [PLO] x [Course]
 *    using the composite key: [Program Entity Title] + [Subject Code] + [Course Number].
 * 3. Primary Discipline Assignment:
 *    Assigns each program to its true home department (matching discipline in
 *    Program Title first, then majority course discipline) so support courses
 *    (like 1 Accounting course inside Real Estate A.S.) never cause cross-department
 *    false positives when filtering by Discipline.
 * 4. Directional Stackable Overlap Engine:
 *    Stackable Overlap % = (|S_D ∩ S_C| / |S_C|) * 100
 *    Degree Completion Contribution % = (|S_D ∩ S_C| / |S_D|) * 100
 * ============================================================================
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
   * 1. APPLICATION STATE
   * ------------------------------------------------------------------------ */
  const state = {
    rawRowCount: 0,
    activeRowCount: 0,
    programsMap: new Map(),           // title -> Deduplicated Active Program Object
    primaryDisciplines: [],           // [{ name, count, degreeCount, certCount }]

    // User Filter & Control State
    filters: {
      searchQuery: '',                // Matches course IDs, course titles, or keywords
      threshold: 80,                  // Default: 80% directional stackable overlap
      selectedDisciplines: new Set(), // Empty Set = All Disciplines shown
      selectedProgramTitles: new Set(), // Empty Set = All Program Titles shown
      programListTierFilter: 'all',   // 'all' | 'Degree' | 'Certificate' (for sidebar list)
      sortBy: 'certCount',            // 'certCount' | 'maxOverlap' | 'alpha' | 'units'
      onlyWithCerts: true,
      excludeGe: true,                // Exclude Cal-GETC / GE Breadth by default
      matrixScope: 'matching',        // 'matching' | 'top35' | 'all'
      networkHideIsolated: true
    },

    // Filtered Analytical Outputs
    filteredDegrees: [],
    filteredCerts: [],
    programFamilies: [],
    allQualifyingPairs: [],
    pairLookupMap: new Map(),         // "degreeTitle|||certTitle" -> OverlapPairResult

    // UI Interaction State
    activeView: 'families',           // 'families' | 'network' | 'matrix'
    expandedFamilies: new Set(),
    selectedCertByDegree: new Map(),
    networkInstance: null,
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

    // Horizon & KPI Summary Cards
    dom.activeFilterSummaryTag = document.getElementById('activeFilterSummaryTag');
    dom.kpiRadialPath = document.getElementById('kpiRadialPath');
    dom.kpiRadialPct = document.getElementById('kpiRadialPct');
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
    dom.controlSidebar = document.getElementById('controlSidebar');
    dom.collapseSidebarBtn = document.getElementById('collapseSidebarBtn');
    dom.expandSidebarBtn = document.getElementById('expandSidebarBtn');
    dom.activeFiltersBadge = document.getElementById('activeFiltersBadge');
    dom.resetFiltersBtn = document.getElementById('resetFiltersBtn');
    dom.searchInput = document.getElementById('searchInput');
    dom.clearSearchBtn = document.getElementById('clearSearchBtn');
    dom.thresholdSlider = document.getElementById('thresholdSlider');
    dom.thresholdValueDisplay = document.getElementById('thresholdValueDisplay');
    dom.presetPills = document.querySelectorAll('.preset-pill');

    // Discipline Accordion
    dom.disciplineAccordion = document.getElementById('disciplineAccordion');
    dom.disciplineAccordionBtn = document.getElementById('disciplineAccordionBtn');
    dom.disciplineBadge = document.getElementById('disciplineBadge');
    dom.disciplineSearchInput = document.getElementById('disciplineSearchInput');
    dom.clearDisciplinesBtn = document.getElementById('clearDisciplinesBtn');
    dom.disciplineOptionsList = document.getElementById('disciplineOptionsList');

    // Program Titles Accordion
    dom.programTitleAccordion = document.getElementById('programTitleAccordion');
    dom.programTitleAccordionBtn = document.getElementById('programTitleAccordionBtn');
    dom.programTitleBadge = document.getElementById('programTitleBadge');
    dom.tierMiniBtns = document.querySelectorAll('.tier-mini-btn');
    dom.programTitleSearchInput = document.getElementById('programTitleSearchInput');
    dom.programListCountHint = document.getElementById('programListCountHint');
    dom.clearProgramTitlesBtn = document.getElementById('clearProgramTitlesBtn');
    dom.programTitleOptionsList = document.getElementById('programTitleOptionsList');

    // Sort & Toggles
    dom.sortBySelect = document.getElementById('sortBySelect');
    dom.onlyWithCertsToggle = document.getElementById('onlyWithCertsToggle');
    dom.excludeGeToggle = document.getElementById('excludeGeToggle');

    // View Tabs & Toolbar
    dom.viewTabs = document.querySelectorAll('.plan-tab');
    dom.tabBadgeFamilies = document.getElementById('tabBadgeFamilies');
    dom.tabBadgeNetwork = document.getElementById('tabBadgeNetwork');
    dom.resultsToolbarSummary = document.getElementById('resultsToolbarSummary');
    dom.familyBulkActions = document.getElementById('familyBulkActions');
    dom.expandAllFamiliesBtn = document.getElementById('expandAllFamiliesBtn');
    dom.collapseAllFamiliesBtn = document.getElementById('collapseAllFamiliesBtn');

    // View Panes
    dom.viewFamilies = document.getElementById('viewFamilies');
    dom.viewNetwork = document.getElementById('viewNetwork');
    dom.viewMatrix = document.getElementById('viewMatrix');
    dom.familyCardsContainer = document.getElementById('familyCardsContainer');

    // Network View
    dom.networkCanvas = document.getElementById('networkCanvas');
    dom.networkHideIsolatedToggle = document.getElementById('networkHideIsolatedToggle');
    dom.networkPhysicsBtn = document.getElementById('networkPhysicsBtn');
    dom.networkFitBtn = document.getElementById('networkFitBtn');
    dom.inspectorEmptyState = document.getElementById('inspectorEmptyState');
    dom.inspectorContent = document.getElementById('inspectorContent');

    // Matrix View
    dom.matrixScopeSelect = document.getElementById('matrixScopeSelect');
    dom.matrixDimensionsBadge = document.getElementById('matrixDimensionsBadge');
    dom.matrixScrollContainer = document.getElementById('matrixScrollContainer');

    // Modal & PDF
    dom.comparisonModalBackdrop = document.getElementById('comparisonModalBackdrop');
    dom.modalEyebrow = document.getElementById('modalEyebrow');
    dom.modalTitle = document.getElementById('modalTitle');
    dom.modalBodyContent = document.getElementById('modalBodyContent');
    dom.closeModalBtn = document.getElementById('closeModalBtn');
    dom.pdfReportContent = document.getElementById('pdfReportContent');
  }

  /* ------------------------------------------------------------------------
   * 3. DATASET QUIRKS, ACTIVE-ONLY FILTERING & PRIMARY DISCIPLINE MAPPING
   * ------------------------------------------------------------------------ */

  /**
   * Classifies a Program Entity Title into 'Degree' or 'Certificate'.
   * Handles edge cases like 'Nursing VN to RN: Non-Degree Option Certificate'.
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
   * Detects General Education / Transfer breadth patterns (Cal-GETC, CSU-GE, IGETC, Local GE).
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
   * Determines a program's true Primary Discipline / Home Department.
   *
   * Why this matters:
   * A degree like `Real Estate A.S. Degree` has 7 Real Estate courses,
   * 2 Business Legal Studies courses, and 1 Accounting course (`ACCTG 1A`).
   * Its primary department is `Real Estate`, NOT `Accounting`.
   *
   * Heuristic:
   * 1. If the program is a General Education breadth pattern, return 'General Education / Transfer Breadth'.
   * 2. If any course discipline name in the program appears directly in the Program Entity Title
   *    (preferring longest match, then highest course count), use that discipline.
   * 3. Check prefix before ':' (e.g., 'Nursing: Associate Degree' -> 'Nursing').
   * 4. Otherwise, use the discipline with the highest deduplicated course count in the program.
   */
  function determinePrimaryDiscipline(title, disciplineCountsMap, isGeBreadth) {
    if (isGeBreadth) {
      return 'General Education / Transfer Breadth';
    }
    const entries = Array.from(disciplineCountsMap.entries());
    if (entries.length === 0) {
      return 'Unspecified';
    }

    const titleLower = String(title || '').toLowerCase();

    // 1. Direct discipline name match inside Program Title
    const directMatches = entries.filter(([disc]) => titleLower.includes(disc.toLowerCase()));
    if (directMatches.length > 0) {
      directMatches.sort((a, b) => {
        if (b[0].length !== a[0].length) return b[0].length - a[0].length;
        return b[1] - a[1];
      });
      return directMatches[0][0];
    }

    // 2. Prefix match before colon (e.g. "Nursing: Associate Degree" -> "Nursing")
    const prefixMatches = entries.filter(([disc]) => {
      if (!disc.includes(':')) return false;
      const prefix = disc.split(':')[0].trim().toLowerCase();
      return prefix.length > 2 && titleLower.includes(prefix);
    });
    if (prefixMatches.length > 0) {
      prefixMatches.sort((a, b) => b[1] - a[1]);
      return prefixMatches[0][0];
    }

    // 3. Majority / Modal course count discipline
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  }

  /**
   * Ingests raw CSV rows, filters strictly to `Program Status === 'Active'`,
   * and deduplicates courses per program using:
   *   [Program Entity Title] + [Subject Code] + [Course Number]
   */
  function ingestActiveProgramsFromCsv(rows) {
    state.rawRowCount = rows.length;
    let activeRows = 0;
    const programsMap = new Map();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const status = String(row['Program Status'] || '').trim();

      // Strictly focus on Active programs only
      if (status !== 'Active') {
        continue;
      }
      activeRows++;

      const title = String(row['Program Entity Title'] || row['Degree Path'] || '').trim();
      if (!title) continue;

      let prog = programsMap.get(title);
      if (!prog) {
        const isGe = isGeneralEducationBreadth(title);
        prog = {
          title,
          tier: classifyProgramTier(title),
          status: 'Active',
          description: String(row['Program Description'] || '').trim(),
          implementationDate: String(row['Implementation Date'] || '').trim(),
          chancellorCode: String(row['Chancellor_s Office Unique Code'] || '').replace(/\.0$/, '').trim(),
          localCode: String(row['Local Code'] || '').trim(),
          controlNumber: String(row['Program Control Number'] || '').replace(/\.0$/, '').trim(),
          isGeBreadth: isGe,
          coursesMap: new Map(),        // courseId -> Course Object
          courseIdsSet: new Set(),      // Set of canonical course IDs ("DRAFT 20")
          disciplineCounts: new Map(),  // discipline -> course count
          plosSet: new Set(),           // Deduplicated PLOs
          totalUnits: 0
        };
        programsMap.set(title, prog);
      }

      // Collect distinct Program Learning Outcomes (PLOs)
      const plo = String(row['Program_Program Outcome Outcome'] || '').trim();
      if (plo) {
        prog.plosSet.add(plo);
      }

      // Exclude structural header rows where Course Number is null/empty
      const courseNum = String(
        row['Course Number'] || row['Program_Course Block_Course Block Item Course Number'] || ''
      ).trim();
      const subjectCode = String(
        row['Program_Course Block_Course Block Item Course Subject Code'] || ''
      ).trim();

      if (!courseNum || !subjectCode) {
        continue;
      }

      const courseId = `${subjectCode} ${courseNum}`;
      const discipline = String(row['Discipline'] || '').trim();

      // Composite Key Deduplication: [Program Entity Title] + [Subject Code] + [Course Number]
      if (!prog.coursesMap.has(courseId)) {
        const courseTitle = String(
          row['Course Title'] || row['Program_Course Block_Course Block Item Course Title'] || ''
        ).trim();
        const rawMinUnits = parseFloat(row['Min Units']);
        const minUnits = Number.isFinite(rawMinUnits) ? rawMinUnits : 0;
        const blockTitle = String(row['Course Block Title'] || '').trim();

        prog.coursesMap.set(courseId, {
          courseId,
          subjectCode,
          courseNumber: courseNum,
          courseTitle,
          minUnits,
          discipline: discipline || 'Unspecified',
          blockTitle
        });

        prog.courseIdsSet.add(courseId);
        prog.totalUnits += minUnits;

        if (discipline) {
          prog.disciplineCounts.set(discipline, (prog.disciplineCounts.get(discipline) || 0) + 1);
        }
      }
    }

    // Remove any shell programs with 0 deduplicated courses and finalize primaryDiscipline
    const primaryDiscStats = new Map();

    for (const [title, prog] of programsMap.entries()) {
      if (prog.coursesMap.size === 0) {
        programsMap.delete(title);
        continue;
      }

      prog.totalUnits = Math.round(prog.totalUnits * 100) / 100;
      prog.coursesList = Array.from(prog.coursesMap.values()).sort((a, b) =>
        a.courseId.localeCompare(b.courseId, undefined, { numeric: true })
      );
      prog.plosList = Array.from(prog.plosSet);
      prog.primaryDiscipline = determinePrimaryDiscipline(
        prog.title,
        prog.disciplineCounts,
        prog.isGeBreadth
      );

      if (!primaryDiscStats.has(prog.primaryDiscipline)) {
        primaryDiscStats.set(prog.primaryDiscipline, {
          name: prog.primaryDiscipline,
          count: 0,
          degreeCount: 0,
          certCount: 0
        });
      }
      const stat = primaryDiscStats.get(prog.primaryDiscipline);
      stat.count++;
      if (prog.tier === 'Degree') stat.degreeCount++;
      else stat.certCount++;
    }

    state.activeRowCount = activeRows;
    state.programsMap = programsMap;
    state.primaryDisciplines = Array.from(primaryDiscStats.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    renderDisciplineFilterList();
    renderProgramTitleFilterList();
  }

  /* ------------------------------------------------------------------------
   * 4. DIRECTIONAL STACKABLE OVERLAP ENGINE
   * ------------------------------------------------------------------------ */

  /**
   * Computes directional stackability metrics between Degree D and Certificate C:
   * - Shared Courses: S_D ∩ S_C
   * - Stackable Overlap %: (|S_D ∩ S_C| / |S_C|) * 100
   * - Overlapping Units %: (Sum of Min Units for Shared / Sum of Min Units in S_C) * 100
   * - Degree Completion Contribution %: (|S_D ∩ S_C| / |S_D|) * 100
   */
  function computePairOverlap(degree, cert) {
    const sharedCourses = [];
    const certGapCourses = [];
    let sharedUnits = 0;

    for (const course of cert.coursesList) {
      if (degree.coursesMap.has(course.courseId)) {
        sharedCourses.push(course);
        sharedUnits += course.minUnits;
      } else {
        certGapCourses.push(course);
      }
    }

    const degreeOnlyCourses = [];
    for (const course of degree.coursesList) {
      if (!cert.coursesMap.has(course.courseId)) {
        degreeOnlyCourses.push(course);
      }
    }

    const dCount = degree.coursesList.length;
    const cCount = cert.coursesList.length;
    const sharedCount = sharedCourses.length;

    const stackableOverlapPct = cCount > 0 ? (sharedCount / cCount) * 100 : 0;
    const degreeContributionPct = dCount > 0 ? (sharedCount / dCount) * 100 : 0;
    const overlappingUnitsPct =
      cert.totalUnits > 0 ? (sharedUnits / cert.totalUnits) * 100 : stackableOverlapPct;

    const certAdditionalUnits = Math.max(0, Math.round((cert.totalUnits - sharedUnits) * 100) / 100);
    const degreeRemainingUnits = Math.max(0, Math.round((degree.totalUnits - sharedUnits) * 100) / 100);
    sharedUnits = Math.round(sharedUnits * 100) / 100;

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
      overlappingUnitsPct,
      degreeContributionPct,
      isEmbeddedMilestone: sharedCount === cCount && cCount > 0
    };
  }

  /**
   * Checks if a program matches the keyword search bar (Course ID, Course Title, or Program Title).
   */
  function matchesKeywordSearch(prog, searchLower) {
    if (!searchLower) return true;
    if (prog.title.toLowerCase().includes(searchLower)) return true;
    if (prog.primaryDiscipline.toLowerCase().includes(searchLower)) return true;
    for (const c of prog.coursesList) {
      if (
        c.courseId.toLowerCase().includes(searchLower) ||
        c.courseTitle.toLowerCase().includes(searchLower)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Runs the full analytical pipeline with Discipline, Program Title, Threshold,
   * and Keyword filters.
   */
  function runAnalysisPipeline() {
    const searchLower = state.filters.searchQuery.trim().toLowerCase();
    const threshold = state.filters.threshold;
    const selectedDiscs = state.filters.selectedDisciplines;
    const selectedTitles = state.filters.selectedProgramTitles;

    // Determine if the user selected specific Degree titles vs Certificate titles
    const selectedDegreeTitles = new Set();
    const selectedCertTitles = new Set();
    for (const t of selectedTitles) {
      const p = state.programsMap.get(t);
      if (!p) continue;
      if (p.tier === 'Degree') selectedDegreeTitles.add(t);
      else selectedCertTitles.add(t);
    }

    const candidateDegrees = [];
    const allActiveCerts = [];

    for (const prog of state.programsMap.values()) {
      if (state.filters.excludeGe && prog.isGeBreadth) continue;

      if (prog.tier === 'Degree') {
        // Filter Degrees by Primary Discipline (if any discipline is selected)
        if (selectedDiscs.size > 0 && !selectedDiscs.has(prog.primaryDiscipline)) {
          continue;
        }
        // If specific Degree titles are checked, restrict to those Degrees
        if (selectedDegreeTitles.size > 0 && !selectedDegreeTitles.has(prog.title)) {
          continue;
        }
        candidateDegrees.push(prog);
      } else {
        allActiveCerts.push(prog);
      }
    }

    const pairLookupMap = new Map();
    const allQualifyingPairs = [];
    const families = [];
    const includedDegreesMap = new Map();
    const includedCertsMap = new Map();

    for (const degree of candidateDegrees) {
      const degreeMatchesSearch = matchesKeywordSearch(degree, searchLower);
      const qualifyingCerts = [];

      for (const cert of allActiveCerts) {
        // If the user explicitly selected specific Certificate titles in Program Titles,
        // only evaluate those certificates!
        if (selectedCertTitles.size > 0 && !selectedCertTitles.has(cert.title)) {
          continue;
        }

        const certMatchesSearch = matchesKeywordSearch(cert, searchLower);
        if (searchLower && !degreeMatchesSearch && !certMatchesSearch) {
          continue;
        }

        const pairResult = computePairOverlap(degree, cert);
        if (pairResult.sharedCount > 0) {
          pairLookupMap.set(`${degree.title}|||${cert.title}`, pairResult);
        }

        if (pairResult.stackableOverlapPct >= threshold) {
          qualifyingCerts.push(pairResult);
          allQualifyingPairs.push(pairResult);
          includedDegreesMap.set(degree.title, degree);
          includedCertsMap.set(cert.title, cert);
        }
      }

      // Sort qualifying certificates by Stackable Overlap % DESC, then Shared Units DESC
      qualifyingCerts.sort((a, b) => {
        if (Math.abs(b.stackableOverlapPct - a.stackableOverlapPct) > 0.001) {
          return b.stackableOverlapPct - a.stackableOverlapPct;
        }
        return b.sharedUnits - a.sharedUnits;
      });

      // If user explicitly checked a Degree Title or unchecked "Only Degrees with >=1 cert",
      // show the Degree card even if 0 certs meet the threshold
      const forceShowDegree =
        selectedDegreeTitles.has(degree.title) || !state.filters.onlyWithCerts;

      if (qualifyingCerts.length > 0 || (forceShowDegree && degreeMatchesSearch)) {
        const maxOverlap =
          qualifyingCerts.length > 0 ? qualifyingCerts[0].stackableOverlapPct : 0;
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

    // Also include certificates that match the active Discipline & Program Title filters
    for (const cert of allActiveCerts) {
      if (selectedDiscs.size > 0 && !selectedDiscs.has(cert.primaryDiscipline)) continue;
      if (selectedCertTitles.size > 0 && !selectedCertTitles.has(cert.title)) continue;
      if (selectedDegreeTitles.size > 0 && selectedCertTitles.size === 0) continue;
      if (!matchesKeywordSearch(cert, searchLower)) continue;
      includedCertsMap.set(cert.title, cert);
    }

    // Sort Program Families
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

    // Auto-expand top 4 families if none are currently expanded
    if (state.expandedFamilies.size === 0 && families.length > 0) {
      for (let i = 0; i < Math.min(4, families.length); i++) {
        const fam = families[i];
        state.expandedFamilies.add(fam.degree.title);
        if (fam.qualifyingCerts.length > 0 && !state.selectedCertByDegree.has(fam.degree.title)) {
          state.selectedCertByDegree.set(fam.degree.title, fam.qualifyingCerts[0].cert.title);
        }
      }
    }

    updateKpisAndFilterBadges();
    renderActiveView();
  }

  /* ------------------------------------------------------------------------
   * 5. KPI RIBBON & SIDEBAR FILTER LIST RENDERING
   * ------------------------------------------------------------------------ */

  function updateKpisAndFilterBadges() {
    const degCount = state.filteredDegrees.length;
    const certCount = state.filteredCerts.length;
    const totalProgs = degCount + certCount;

    const familiesWithCerts = state.programFamilies.filter(
      (f) => f.qualifyingCerts.length > 0
    ).length;

    // Calculate total candidate degrees in current discipline scope for radial percentage
    let totalCandidateDegreesInScope = 0;
    for (const prog of state.programsMap.values()) {
      if (prog.tier !== 'Degree') continue;
      if (state.filters.excludeGe && prog.isGeBreadth) continue;
      if (
        state.filters.selectedDisciplines.size > 0 &&
        !state.filters.selectedDisciplines.has(prog.primaryDiscipline)
      ) {
        continue;
      }
      totalCandidateDegreesInScope++;
    }

    const stackableRatePct =
      totalCandidateDegreesInScope > 0
        ? Math.round((familiesWithCerts / totalCandidateDegreesInScope) * 100)
        : 0;

    dom.kpiRadialPath.setAttribute('stroke-dasharray', `${stackableRatePct}, 100`);
    dom.kpiRadialPct.textContent = `${stackableRatePct}%`;
    dom.kpiProgramFamilies.textContent = `${familiesWithCerts} ${
      familiesWithCerts === 1 ? 'Family' : 'Families'
    }`;
    dom.kpiFamilySubtext.textContent = `of ${totalCandidateDegreesInScope} active degrees (≥${state.filters.threshold}%)`;

    const totalPairs = state.allQualifyingPairs.length;
    const embeddedMilestonePairs = state.allQualifyingPairs.filter(
      (p) => p.isEmbeddedMilestone
    ).length;

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

    dom.kpiStackablePairs.textContent = totalPairs.toLocaleString();
    dom.kpiPairsSubtext.textContent = `Cert overlap ≥ ${state.filters.threshold}%`;

    dom.kpiEmbeddedCerts.textContent = embeddedMilestonePairs.toLocaleString();

    dom.kpiUniqueCourses.textContent = uniqueCourses.size.toLocaleString();
    dom.kpiRawRowsNote.textContent = `${deduplicatedProgramCoursePairs.toLocaleString()} distinct reqs`;

    // Update View Tab Counters
    dom.tabBadgeFamilies.textContent = state.programFamilies.length;
    dom.tabBadgeNetwork.textContent = totalPairs;

    // Update Horizon Scope Tag & Results Toolbar Summary
    const discCount = state.filters.selectedDisciplines.size;
    const titleCount = state.filters.selectedProgramTitles.size;
    let scopeLabel = 'All Disciplines';
    if (discCount === 1) {
      scopeLabel = Array.from(state.filters.selectedDisciplines)[0];
    } else if (discCount > 1) {
      scopeLabel = `${discCount} Disciplines`;
    }
    if (titleCount > 0) {
      scopeLabel += ` • ${titleCount} Program(s)`;
    }
    dom.activeFilterSummaryTag.innerHTML = `<span>Scope: ${escapeHtml(scopeLabel)}</span>`;

    const activeFilterCount =
      (discCount > 0 ? 1 : 0) +
      (titleCount > 0 ? 1 : 0) +
      (state.filters.searchQuery.trim() ? 1 : 0) +
      (state.filters.threshold !== 80 ? 1 : 0);

    dom.activeFiltersBadge.textContent =
      activeFilterCount > 0 ? `${activeFilterCount} Active Filter(s)` : 'Default Scope';

    dom.resultsToolbarSummary.innerHTML = `Showing <strong>${state.programFamilies.length}</strong> Degree Program ${
      state.programFamilies.length === 1 ? 'Family' : 'Families'
    } and <strong>${totalPairs}</strong> Stackable Certificate ${
      totalPairs === 1 ? 'Pathway' : 'Pathways'
    } (&ge;${state.filters.threshold}% overlap) in <strong>${escapeHtml(scopeLabel)}</strong>`;
  }

  /**
   * Renders the Discipline / Department checkbox list in the sidebar.
   * Clicking any discipline immediately filters to that primary department.
   */
  function renderDisciplineFilterList() {
    const query = dom.disciplineSearchInput.value.trim().toLowerCase();
    const selected = state.filters.selectedDisciplines;

    if (selected.size === 0) {
      dom.disciplineBadge.textContent = 'All';
      dom.disciplineBadge.classList.remove('active');
    } else {
      dom.disciplineBadge.textContent = `${selected.size} Selected`;
      dom.disciplineBadge.classList.add('active');
    }

    const rowsHtml = state.primaryDisciplines
      .filter((d) => {
        if (state.filters.excludeGe && d.name === 'General Education / Transfer Breadth') {
          return false;
        }
        return !query || d.name.toLowerCase().includes(query);
      })
      .map((d) => {
        const isChecked = selected.has(d.name);
        return `
          <label class="checkbox-label ${isChecked ? 'checked-row' : ''}">
            <input type="checkbox" class="js-discipline-check" value="${escapeHtml(d.name)}" ${
          isChecked ? 'checked' : ''
        } />
            <span class="checkbox-text" title="${escapeHtml(d.name)} (${d.degreeCount} Deg, ${
          d.certCount
        } Cert)">${escapeHtml(d.name)}</span>
            <span class="checkbox-count">${d.count}</span>
          </label>
        `;
      })
      .join('');

    dom.disciplineOptionsList.innerHTML =
      rowsHtml || `<div class="accordion-hint">No matching disciplines found.</div>`;
  }

  /**
   * Renders the Program Titles checkbox list in the sidebar.
   * Dynamically respects the active Discipline filter and Tier mini-tabs
   * ('All' | 'Degrees' | 'Certificates') so users can easily pick specific programs.
   */
  function renderProgramTitleFilterList() {
    const query = dom.programTitleSearchInput.value.trim().toLowerCase();
    const tierFilter = state.filters.programListTierFilter;
    const selectedDiscs = state.filters.selectedDisciplines;
    const selectedTitles = state.filters.selectedProgramTitles;

    if (selectedTitles.size === 0) {
      dom.programTitleBadge.textContent = 'All';
      dom.programTitleBadge.classList.remove('active');
    } else {
      dom.programTitleBadge.textContent = `${selectedTitles.size} Selected`;
      dom.programTitleBadge.classList.add('active');
    }

    const matchingPrograms = Array.from(state.programsMap.values())
      .filter((p) => {
        if (state.filters.excludeGe && p.isGeBreadth) return false;
        // Keep already-checked titles visible even if discipline changes
        if (selectedTitles.has(p.title)) return true;
        if (selectedDiscs.size > 0 && !selectedDiscs.has(p.primaryDiscipline)) return false;
        if (tierFilter !== 'all' && p.tier !== tierFilter) return false;
        if (query && !p.title.toLowerCase().includes(query)) return false;
        return true;
      })
      .sort((a, b) => a.title.localeCompare(b.title));

    dom.programListCountHint.textContent = `${matchingPrograms.length} active program(s) listed`;

    const rowsHtml = matchingPrograms
      .map((p) => {
        const isChecked = selectedTitles.has(p.title);
        const shortTier = p.tier === 'Degree' ? 'DEG' : 'CERT';
        return `
          <label class="checkbox-label ${isChecked ? 'checked-row' : ''}">
            <input type="checkbox" class="js-program-title-check" value="${escapeHtml(p.title)}" ${
          isChecked ? 'checked' : ''
        } />
            <span class="checkbox-text" title="${escapeHtml(p.title)} (${escapeHtml(
          p.primaryDiscipline
        )})">${escapeHtml(p.title)}</span>
            <span class="checkbox-count">${shortTier}</span>
          </label>
        `;
      })
      .join('');

    dom.programTitleOptionsList.innerHTML =
      rowsHtml || `<div class="accordion-hint">No matching programs found.</div>`;
  }

  /* ------------------------------------------------------------------------
   * 6. VIEW 1: STACKABLE FAMILY EXPLORER (CARD/TREE DECK)
   * ------------------------------------------------------------------------ */

  function renderActiveView() {
    if (state.activeView === 'families') {
      renderFamilyExplorerView();
    } else if (state.activeView === 'network') {
      renderNetworkClusterView();
    } else if (state.activeView === 'matrix') {
      renderCrosswalkMatrixView();
    }
  }

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
      : `<div class="accordion-hint">No shared courses found.</div>`;

    const certGapBadgesHtml = isEmbeddedMilestone
      ? `<div class="milestone-celebration-banner">
           &#127942; <strong>100% Embedded Milestone!</strong><br/>
           Every course required for <em>${escapeHtml(cert.title)}</em> is already embedded in <em>${escapeHtml(degree.title)}</em>. Students earn this certificate automatically with <strong>0 extra courses</strong>.
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
      : `<div class="milestone-celebration-banner">All degree major courses are satisfied by this certificate!</div>`;

    return `
      <div class="${isModal ? 'modal-checklist-wrapper' : 'gap-checklist-drawer'}">
        <div class="drawer-header">
          <div>
            <h4 class="drawer-title">
              Course Gap Checklist: ${escapeHtml(cert.title)} &rarr; ${escapeHtml(degree.title)}
            </h4>
            <div class="drawer-subtitle">
              Stackable Overlap: <strong>${stackableOverlapPct.toFixed(1)}%</strong> (${sharedCount}/${certCourseCount} cert courses) &bull;
              Overlapping Units: <strong>${overlappingUnitsPct.toFixed(1)}%</strong> &bull;
              Degree Completion Contribution: <strong>${degreeContributionPct.toFixed(1)}%</strong> (${sharedCount}/${degreeCourseCount} degree courses)
            </div>
          </div>
          ${
            !isModal
              ? `<button type="button" class="btn btn-secondary btn-xs js-open-pair-modal"
                   data-degree="${escapeHtml(degree.title)}"
                   data-cert="${escapeHtml(cert.title)}">
                   Full Side-by-Side Modal
                 </button>`
              : ''
          }
        </div>

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
          <h3>No Active Program Families Match Your Current Filters</h3>
          <p style="margin-top:0.4rem;">Try lowering the <strong>Min Overlap Threshold</strong> slider (currently ${state.filters.threshold}%), unchecking filters in the sidebar, or clicking <strong>Reset All</strong>.</p>
        </div>
      `;
      return;
    }

    const htmlChunks = [];

    for (const family of families) {
      const { degree, qualifyingCerts, embeddedCount } = family;
      const isExpanded = state.expandedFamilies.has(degree.title);
      const selectedCertTitle = state.selectedCertByDegree.get(degree.title) || null;

      let activeDrawerPair = null;
      if (selectedCertTitle) {
        activeDrawerPair = qualifyingCerts.find((p) => p.cert.title === selectedCertTitle) || null;
      }

      const certCardsHtml =
        qualifyingCerts.length > 0
          ? `<div class="cert-cards-grid">
              ${qualifyingCerts
                .map((pair) => {
                  const pct = pair.stackableOverlapPct;
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
                            <span class="discipline-tag">${escapeHtml(
                              pair.cert.primaryDiscipline
                            )}</span>
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
                            : '&#9654; Click to view Course Gap Checklist'
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
          : `<div class="accordion-hint">No active certificates meet the ${state.filters.threshold}% overlap threshold for this degree.</div>`;

      htmlChunks.push(`
        <article class="family-card" data-degree-card="${escapeHtml(degree.title)}">
          <div class="family-card-header js-toggle-family" data-degree="${escapeHtml(degree.title)}">
            <div class="family-degree-info">
              <div class="family-badges-row">
                <span class="tier-pill tier-degree">Associate Degree</span>
                <span class="discipline-tag">${escapeHtml(degree.primaryDiscipline)}</span>
              </div>
              <h3 class="family-degree-title">${escapeHtml(degree.title)}</h3>
              <div class="family-degree-meta">
                <span><strong>${degree.coursesList.length}</strong> Unique Courses</span>
                <span>&bull;</span>
                <span><strong>${degree.totalUnits}</strong> Min Catalog Units</span>
                ${
                  embeddedCount > 0
                    ? `<span>&bull;</span><span class="text-amber" style="font-weight: 700;">&#9733; ${embeddedCount} Automatic 100% Milestone(s)</span>`
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
              <button type="button" class="btn btn-secondary btn-xs js-inspect-program" data-program="${escapeHtml(
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

    for (const deg of state.filteredDegrees) {
      if (hideIsolated && !connectedDegrees.has(deg.title)) continue;
      const sizeVal = Math.max(16, Math.min(42, 12 + Math.sqrt(deg.totalUnits) * 2.6));

      nodesArray.push({
        id: deg.title,
        label: truncateText(deg.title, 34),
        title: `${deg.title}\nDepartment: ${deg.primaryDiscipline}\nCourses: ${deg.coursesList.length} | Units: ${deg.totalUnits}`,
        shape: 'dot',
        size: sizeVal,
        color: {
          background: '#990000',
          border: '#fca5a5',
          highlight: { background: '#dc2626', border: '#ffffff' }
        },
        font: {
          color: isDark ? '#f8fafc' : '#0f172a',
          size: 12,
          face: 'Inter, sans-serif',
          strokeWidth: isDark ? 3 : 4,
          strokeColor: isDark ? '#0b1120' : '#ffffff'
        }
      });
    }

    for (const cert of state.filteredCerts) {
      if (hideIsolated && !connectedCerts.has(cert.title)) continue;
      const isMilestone = embeddedCertTitles.has(cert.title);
      const sizeVal = Math.max(12, Math.min(34, 10 + Math.sqrt(cert.totalUnits) * 2.2));

      nodesArray.push({
        id: cert.title,
        label: truncateText(cert.title, 30),
        title: `${cert.title}\nDepartment: ${cert.primaryDiscipline}\nCourses: ${cert.coursesList.length} | Units: ${cert.totalUnits}`,
        shape: 'dot',
        size: sizeVal,
        color: isMilestone
          ? {
              background: '#d97706',
              border: '#fde68a',
              highlight: { background: '#f59e0b', border: '#ffffff' }
            }
          : {
              background: '#475569',
              border: '#cbd5e1',
              highlight: { background: '#64748b', border: '#ffffff' }
            },
        font: {
          color: isDark ? '#e2e8f0' : '#334155',
          size: 11,
          face: 'Inter, sans-serif',
          strokeWidth: isDark ? 3 : 4,
          strokeColor: isDark ? '#0b1120' : '#ffffff'
        }
      });
    }

    for (const pair of state.allQualifyingPairs) {
      const pct = pair.stackableOverlapPct;
      const edgeWidth = Math.max(1.5, ((pct - 45) / 55) * 6.5);

      edgesArray.push({
        id: `${pair.degree.title}|||${pair.cert.title}`,
        from: pair.cert.title,
        to: pair.degree.title,
        width: edgeWidth,
        label: `${pct.toFixed(0)}%`,
        title: `${pair.cert.title} → ${pair.degree.title}\nStackable Overlap: ${pct.toFixed(1)}% (${pair.sharedCount}/${pair.certCourseCount} courses)`,
        arrows: {
          to: { enabled: true, scaleFactor: 0.55 }
        },
        color: {
          color: pair.isEmbeddedMilestone
            ? '#d97706'
            : isDark
            ? 'rgba(248, 113, 113, 0.65)'
            : 'rgba(153, 0, 0, 0.55)',
          highlight: '#990000'
        },
        font: {
          size: 10,
          color: isDark ? '#cbd5e1' : '#475569',
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
        keyboard: true
      }
    };

    if (state.networkInstance) {
      state.networkInstance.destroy();
    }

    state.networkInstance = new vis.Network(dom.networkCanvas, data, options);

    state.networkInstance.on('click', function (params) {
      if (params.nodes && params.nodes.length > 0) {
        renderNetworkNodeInspector(params.nodes[0]);
      } else if (params.edges && params.edges.length > 0) {
        const pair = state.pairLookupMap.get(params.edges[0]);
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

    const connectedPairs = state.allQualifyingPairs
      .filter((p) => p.degree.title === programTitle || p.cert.title === programTitle)
      .sort((a, b) => b.stackableOverlapPct - a.stackableOverlapPct);

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
                    pair.stackableOverlapPct,
                    pair.isEmbeddedMilestone
                  )}">${pair.stackableOverlapPct.toFixed(0)}%</span>
                </div>
                <div style="font-size:0.73rem; color:var(--text-secondary); margin-top:0.25rem;">
                  ${pair.sharedCount}/${pair.certCourseCount} cert courses shared (${pair.sharedUnits} u) &bull; Click for Gap Checklist
                </div>
              </div>
            `;
          })
          .join('')
      : `<div class="accordion-hint">No connected programs at ≥${state.filters.threshold}% threshold.</div>`;

    dom.inspectorContent.innerHTML = `
      <div class="family-badges-row">
        <span class="tier-pill ${prog.tier === 'Degree' ? 'tier-degree' : 'tier-cert'}">${
      prog.tier
    }</span>
        <span class="discipline-tag">${escapeHtml(prog.primaryDiscipline)}</span>
      </div>
      <h3 style="margin:0.35rem 0; font-size:1rem;">${escapeHtml(prog.title)}</h3>
      <div style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:0.75rem;">
        <strong>${prog.coursesList.length}</strong> Unique Courses &bull;
        <strong>${prog.totalUnits}</strong> Min Units
      </div>
      <button type="button" class="btn btn-secondary btn-xs js-inspect-program" data-program="${escapeHtml(
        prog.title
      )}" style="width:100%; margin-bottom:0.9rem;">
        View Full Course List &amp; PLOs
      </button>

      <div class="filter-label">
        Connected Stackable Pathways (${connectedPairs.length})
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
      return 'background-color: #d97706; color: #ffffff;';
    }
    if (pct >= 80) {
      return 'background-color: #990000; color: #ffffff;';
    }
    if (pct >= 50) {
      return 'background-color: rgba(153, 0, 0, 0.48); color: #ffffff;';
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
      degrees = state.programFamilies.slice(0, 35).map((f) => f.degree);
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
            const pct = pair.stackableOverlapPct;
            const style = getMatrixCellStyle(pct, pair.isEmbeddedMilestone);
            return `
              <td class="matrix-cell js-open-pair-modal"
                  style="${style}"
                  data-degree="${escapeHtml(d.title)}"
                  data-cert="${escapeHtml(c.title)}"
                  title="${escapeHtml(d.title)} × ${escapeHtml(c.title)}&#10;Stackable Overlap: ${pct.toFixed(
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
   * 9. MODAL DIALOGS (PAIR COMPARISON & SINGLE PROGRAM INSPECTOR)
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
      ? `<ul style="margin:0.4rem 0 0; padding-left:1.25rem; font-size:0.82rem; color:var(--text-secondary);">
          ${prog.plosList.map((plo) => `<li style="margin-bottom:0.35rem;">${escapeHtml(plo)}</li>`).join('')}
         </ul>`
      : `<div class="accordion-hint">No Program Learning Outcomes listed in dataset.</div>`;

    const coursesRowsHtml = prog.coursesList
      .map(
        (c) => `
        <tr>
          <td style="padding:0.5rem 0.65rem; font-family:var(--font-mono); font-weight:700; border-bottom:1px solid var(--border-light);">${escapeHtml(
            c.courseId
          )}</td>
          <td style="padding:0.5rem 0.65rem; border-bottom:1px solid var(--border-light);">${escapeHtml(
            c.courseTitle
          )}</td>
          <td style="padding:0.5rem 0.65rem; border-bottom:1px solid var(--border-light); font-size:0.76rem; color:var(--text-secondary);">${escapeHtml(
            c.discipline
          )}</td>
          <td style="padding:0.5rem 0.65rem; border-bottom:1px solid var(--border-light); font-size:0.75rem; color:var(--text-secondary);">${escapeHtml(
            c.blockTitle
          )}</td>
          <td style="padding:0.5rem 0.65rem; font-family:var(--font-mono); text-align:right; border-bottom:1px solid var(--border-light);">${
            c.minUnits
          }</td>
        </tr>`
      )
      .join('');

    dom.modalBodyContent.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:1rem;">
        <div class="unit-tally-grid">
          <div class="tally-box tally-box-green">
            <div class="tally-label">Primary Department</div>
            <div class="tally-val" style="font-size:1rem;">${escapeHtml(prog.primaryDiscipline)}</div>
            <div class="tally-sub">Effective: ${escapeHtml(prog.implementationDate || 'Active')}</div>
          </div>
          <div class="tally-box tally-box-blue">
            <div class="tally-label">Unique Courses</div>
            <div class="tally-val">${prog.coursesList.length} Courses</div>
            <div class="tally-sub">Deduplicated from PLO rows</div>
          </div>
          <div class="tally-box tally-box-gold">
            <div class="tally-label">Total Minimum Units</div>
            <div class="tally-val">${prog.totalUnits} Units</div>
            <div class="tally-sub">Active Catalog Requirements</div>
          </div>
          <div class="tally-box tally-box-orange">
            <div class="tally-label">State / Local Codes</div>
            <div class="tally-val">${escapeHtml(prog.localCode || prog.controlNumber || '—')}</div>
            <div class="tally-sub">Control #: ${escapeHtml(prog.controlNumber || '—')}</div>
          </div>
        </div>

        ${
          prog.description
            ? `<div style="background:var(--bg-subtle); padding:0.9rem 1.1rem; border-radius:var(--radius-md); border:1px solid var(--border-light); font-size:0.83rem; color:var(--text-secondary);">
                 <strong style="color:var(--text-primary); display:block; margin-bottom:0.25rem;">Catalog Program Description</strong>
                 ${escapeHtml(prog.description)}
               </div>`
            : ''
        }

        <div style="background:var(--bg-subtle); padding:0.9rem 1.1rem; border-radius:var(--radius-md); border:1px solid var(--border-light);">
          <strong style="font-size:0.85rem;">Program Learning Outcomes (${prog.plosList.length} Distinct PLOs)</strong>
          ${plosHtml}
        </div>

        <div>
          <strong style="font-size:0.86rem; display:block; margin-bottom:0.5rem;">Deduplicated Course Requirements (${
            prog.coursesList.length
          })</strong>
          <div style="max-height:340px; overflow-y:auto; border:1px solid var(--border-light); border-radius:var(--radius-md);">
            <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
              <thead style="background:var(--bg-subtle); position:sticky; top:0;">
                <tr>
                  <th style="text-align:left; padding:0.55rem 0.65rem; border-bottom:1px solid var(--border-medium);">Course ID</th>
                  <th style="text-align:left; padding:0.55rem 0.65rem; border-bottom:1px solid var(--border-medium);">Course Title</th>
                  <th style="text-align:left; padding:0.55rem 0.65rem; border-bottom:1px solid var(--border-medium);">Course Discipline</th>
                  <th style="text-align:left; padding:0.55rem 0.65rem; border-bottom:1px solid var(--border-medium);">Course Block</th>
                  <th style="text-align:right; padding:0.55rem 0.65rem; border-bottom:1px solid var(--border-medium);">Min Units</th>
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

  function exportCrosswalkCsv() {
    const pairs = state.allQualifyingPairs;
    if (pairs.length === 0) {
      alert('No qualifying Degree-Certificate pairs to export at the current filter settings.');
      return;
    }

    const headers = [
      'Degree Title',
      'Degree Primary Discipline',
      'Degree Total Courses',
      'Degree Total Min Units',
      'Certificate Title',
      'Certificate Primary Discipline',
      'Certificate Total Courses',
      'Certificate Total Min Units',
      'Stackable Overlap %',
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
        p.degree.primaryDiscipline,
        p.degree.coursesList.length,
        p.degree.totalUnits,
        p.cert.title,
        p.cert.primaryDiscipline,
        p.cert.coursesList.length,
        p.cert.totalUnits,
        p.stackableOverlapPct.toFixed(2),
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
    link.download = `Chaffey_Active_Program_Overlap_Crosswalk_${state.filters.threshold}pct.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

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
              <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; font-weight:600;">
                ${escapeHtml(p.cert.title)}
                ${
                  p.isEmbeddedMilestone
                    ? '<span style="color:#d97706; font-size:10px; font-weight:700;"> [100% MILESTONE]</span>'
                    : ''
                }
              </td>
              <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:center; font-weight:700; color:#990000;">
                ${p.stackableOverlapPct.toFixed(1)}%
              </td>
              <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:center;">
                ${p.sharedCount} / ${p.certCourseCount} (${p.sharedUnits} u)
              </td>
              <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:center;">
                ${p.degreeContributionPct.toFixed(1)}%
              </td>
              <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; font-size:11px; color:#4b5563;">
                ${
                  p.certGapCourses.length === 0
                    ? '<strong style="color:#16a34a;">0 extra courses needed</strong>'
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
              <span style="font-size:11px; color:#4b5563;">
                ${fam.degree.coursesList.length} Courses &bull; ${
          fam.degree.totalUnits
        } Min Units &bull; ${escapeHtml(fam.degree.primaryDiscipline)}
              </span>
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:11.5px;">
              <thead>
                <tr style="background:#f3f4f6; text-align:left;">
                  <th style="padding:5px 8px; border-bottom:1px solid #d1d5db;">Stackable Certificate</th>
                  <th style="padding:5px 8px; border-bottom:1px solid #d1d5db; text-align:center;">Overlap %</th>
                  <th style="padding:5px 8px; border-bottom:1px solid #d1d5db; text-align:center;">Shared Courses</th>
                  <th style="padding:5px 8px; border-bottom:1px solid #d1d5db; text-align:center;">Degree Contrib.</th>
                  <th style="padding:5px 8px; border-bottom:1px solid #d1d5db;">Remaining Cert Gap Courses</th>
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
            Active Stackable Program Families &amp; Curriculum Overlap Report
          </h1>
        </div>
        <div style="text-align:right; font-size:11px; color:#4b5563;">
          <div>Generated: ${escapeHtml(dateStr)}</div>
          <div>Threshold: &ge;${state.filters.threshold}% Stackable Overlap</div>
          <div>Status Scope: Active Programs Only</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-bottom:18px;">
        <div style="padding:10px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px;">
          <div style="font-size:10px; text-transform:uppercase; color:#6b7280; font-weight:700;">Program Families</div>
          <div style="font-size:18px; font-weight:800; color:#990000;">${familiesWithCerts.length}</div>
        </div>
        <div style="padding:10px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px;">
          <div style="font-size:10px; text-transform:uppercase; color:#6b7280; font-weight:700;">Stackable Pathways</div>
          <div style="font-size:18px; font-weight:800; color:#111827;">${
            state.allQualifyingPairs.length
          }</div>
        </div>
        <div style="padding:10px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px;">
          <div style="font-size:10px; text-transform:uppercase; color:#6b7280; font-weight:700;">100% Embedded Milestones</div>
          <div style="font-size:18px; font-weight:800; color:#d97706;">${
            state.allQualifyingPairs.filter((p) => p.isEmbeddedMilestone).length
          }</div>
        </div>
        <div style="padding:10px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px;">
          <div style="font-size:10px; text-transform:uppercase; color:#6b7280; font-weight:700;">Active Programs</div>
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
      filename: `Chaffey_Active_Program_Families_Report_${state.filters.threshold}pct.pdf`,
      image: { type: 'jpeg', quality: 0.96 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(dom.pdfReportContent).save();
  }

  /* ------------------------------------------------------------------------
   * 11. CSV INGESTION & INITIALIZATION
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
        ingestActiveProgramsFromCsv(results.data);
        runAnalysisPipeline();
        updateStatusIndicator(
          'ready',
          `${sourceLabel} (${state.programsMap.size} Active Programs)`
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
        updateStatusIndicator('error', 'Click "Load CSV" to select Program Summary.csv');
        dom.familyCardsContainer.innerHTML = `
          <div class="empty-state-box">
            <h3>Load "Program Summary.csv" to Begin Analysis</h3>
            <p>Your browser blocked automatic local file fetching (common when opening HTML directly via <code>file://</code>). Click the <strong>Load CSV</strong> button in the top header and select <strong>Program Summary.csv</strong>.</p>
          </div>
        `;
      });
  }

  /* ------------------------------------------------------------------------
   * 12. EVENT LISTENERS & UI BINDINGS
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

    // Collapsible Left Sidebar
    dom.collapseSidebarBtn.addEventListener('click', () => {
      dom.controlSidebar.classList.add('collapsed');
      dom.expandSidebarBtn.classList.remove('hidden');
    });

    dom.expandSidebarBtn.addEventListener('click', () => {
      dom.controlSidebar.classList.remove('collapsed');
      dom.expandSidebarBtn.classList.add('hidden');
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

    // Keyword Search Input
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

    // Threshold Slider & Preset Chips
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

    // Accordion Open/Collapse Toggles
    dom.disciplineAccordionBtn.addEventListener('click', () => {
      dom.disciplineAccordion.classList.toggle('open');
    });

    dom.programTitleAccordionBtn.addEventListener('click', () => {
      dom.programTitleAccordion.classList.toggle('open');
    });

    // Discipline / Department Filter Events
    dom.disciplineSearchInput.addEventListener('input', renderDisciplineFilterList);

    dom.disciplineOptionsList.addEventListener('change', (e) => {
      if (e.target.classList.contains('js-discipline-check')) {
        const disc = e.target.value;
        if (e.target.checked) {
          state.filters.selectedDisciplines.add(disc);
        } else {
          state.filters.selectedDisciplines.delete(disc);
        }
        state.expandedFamilies.clear();
        renderDisciplineFilterList();
        renderProgramTitleFilterList();
        runAnalysisPipeline();
      }
    });

    dom.clearDisciplinesBtn.addEventListener('click', () => {
      state.filters.selectedDisciplines.clear();
      dom.disciplineSearchInput.value = '';
      state.expandedFamilies.clear();
      renderDisciplineFilterList();
      renderProgramTitleFilterList();
      runAnalysisPipeline();
    });

    // Program Titles Filter Events
    dom.tierMiniBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tier = btn.getAttribute('data-tier');
        state.filters.programListTierFilter = tier;
        dom.tierMiniBtns.forEach((b) =>
          b.classList.toggle('active', b.getAttribute('data-tier') === tier)
        );
        renderProgramTitleFilterList();
      });
    });

    dom.programTitleSearchInput.addEventListener('input', renderProgramTitleFilterList);

    dom.programTitleOptionsList.addEventListener('change', (e) => {
      if (e.target.classList.contains('js-program-title-check')) {
        const title = e.target.value;
        if (e.target.checked) {
          state.filters.selectedProgramTitles.add(title);
        } else {
          state.filters.selectedProgramTitles.delete(title);
        }
        state.expandedFamilies.clear();
        renderProgramTitleFilterList();
        runAnalysisPipeline();
      }
    });

    dom.clearProgramTitlesBtn.addEventListener('click', () => {
      state.filters.selectedProgramTitles.clear();
      dom.programTitleSearchInput.value = '';
      state.expandedFamilies.clear();
      renderProgramTitleFilterList();
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
      renderDisciplineFilterList();
      renderProgramTitleFilterList();
      runAnalysisPipeline();
    });

    // Reset All Filters
    dom.resetFiltersBtn.addEventListener('click', () => {
      state.filters.searchQuery = '';
      state.filters.threshold = 80;
      state.filters.selectedDisciplines.clear();
      state.filters.selectedProgramTitles.clear();
      state.filters.programListTierFilter = 'all';
      state.filters.sortBy = 'certCount';
      state.filters.onlyWithCerts = true;
      state.filters.excludeGe = true;

      dom.searchInput.value = '';
      dom.clearSearchBtn.classList.add('hidden');
      dom.disciplineSearchInput.value = '';
      dom.programTitleSearchInput.value = '';
      dom.thresholdSlider.value = 80;
      dom.thresholdValueDisplay.textContent = '80%';
      syncPresetPills(80);
      dom.tierMiniBtns.forEach((b) =>
        b.classList.toggle('active', b.getAttribute('data-tier') === 'all')
      );
      dom.sortBySelect.value = 'certCount';
      dom.onlyWithCertsToggle.checked = true;
      dom.excludeGeToggle.checked = true;

      state.expandedFamilies.clear();
      renderDisciplineFilterList();
      renderProgramTitleFilterList();
      runAnalysisPipeline();
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
   * 13. BOOTSTRAP ON DOM CONTENT LOADED
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
