# Chaffey College | Curriculum Overlap & Stackable Pathway Explorer

A 100% client-side Single-Page Web Application (SPA) built for Higher Education Institutional Research and Curriculum Analytics at **Chaffey College**.

## Overview

This application ingests and normalizes the curriculum catalog export (`Program Summary.csv`) to analyze course overlaps across academic programs, group related credentials into **Program Families**, and identify **Stackable Certificates** (such as 100% embedded milestones) on the pathway toward an Associate Degree.

### Key Analytical Features

1. **Cartesian Product Deduplication Pipeline**:
   - `Program Summary.csv` is flattened at the grain of `[Program Entity Title] × [Program Learning Outcome (PLO)] × [Course Item]`.
   - The engine filters by selected lifecycle statuses (`Active` by default), excludes structural catalog header rows (where `Course Number` is empty), and deduplicates course requirements using the composite key:
     `[Program Entity Title] + [Subject Code] + [Course Number]`.

2. **Stackable Family & Overlap Engine**:
   - **Directional Stackable Overlap %**: $\frac{|S_D \cap S_C|}{|S_C|} \times 100$ (measures the percentage of a Certificate's required courses that are embedded inside a parent Associate Degree).
   - **Overlapping Units %**: $\frac{\sum \text{Min Units}(S_D \cap S_C)}{\sum \text{Min Units}(S_C)} \times 100$.
   - **Degree Completion Contribution %**: $\frac{|S_D \cap S_C|}{|S_D|} \times 100$ (measures how much of the Associate Degree is completed by earning the certificate milestone first).
   - **Jaccard Bidirectional Similarity %**: $\frac{|S_D \cap S_C|}{|S_D \cup S_C|} \times 100$.

3. **Three Interactive Visualization Views**:
   - **Stackable Family Explorer**: Expandable card deck centered on Associate Degrees, displaying qualifying Certificate badges and an interactive **Course Gap Checklist** (Embedded/Satisfied Courses, Remaining Certificate Courses Needed, and Remaining Degree Courses).
   - **Interactive Network Cluster Graph (`vis-network`)**: Force-directed node-link graph with nodes sized by total units and edges scaled by overlap percentage, paired with a Cluster Node Inspector.
   - **Overlap Crosswalk Matrix**: Sticky-header 2D heatmap grid comparing Degrees (rows) and Certificates (columns).

4. **Client-Side Reporting & Exports**:
   - **Export Crosswalk (CSV)**: Tabular export of all filtered Degree–Certificate pairs, shared course lists, and gap courses.
   - **Export Family Report (PDF)**: Branded Executive Summary PDF report powered by `html2pdf.js`.
