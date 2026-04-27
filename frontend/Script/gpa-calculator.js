// GPA Calculator Logic Module
// Contains all GPA calculation functions

const GRADE_POINTS = {
  "A+": 4.0, "A": 4.0, "A-": 3.7,
  "B+": 3.3, "B": 3.0, "B-": 2.7,
  "C+": 2.3, "C": 2.0, "C-": 1.7,
  "D": 1.0, "E": 0.5, "F": 0
};

/**
 * Calculate GPA for a list of modules
 * @param {Array} modules - Array of module objects with grade_point and credits
 * @returns {number} GPA value
 */
function calculateSemesterGPA(modules) {
  if (!modules || modules.length === 0) return 0;

  let totalCredits = 0;
  let totalPoints = 0;

  modules.forEach(module => {
    if (module.grade_point != null && module.credits > 0) {
      totalCredits += module.credits;
      totalPoints += module.grade_point * module.credits;
    }
  });

  return totalCredits > 0 ? totalPoints / totalCredits : 0;
}

/**
 * Calculate goal planner results
 * @param {Object} inputs - Target GPA, total credits, completed credits, current weighted points
 * @returns {Object} Calculation results
 */
function calculateTargetPlan(inputs) {
  const { targetGpa, totalCredits, completedCredits, currentPoints, totalModules = 0 } = inputs;

  // Validation
  if (targetGpa < 0 || targetGpa > 4) {
    throw new Error("Target GPA must be between 0 and 4.0");
  }
  if (totalCredits <= 0) {
    throw new Error("Total credits must be greater than 0");
  }
  if (completedCredits < 0 || currentPoints < 0) {
    throw new Error("Completed credits and current points cannot be negative");
  }

  const remainingCredits = totalCredits - completedCredits;
  if (remainingCredits <= 0) {
    return {
      message: "No remaining credits. Your GPA is already fixed from completed modules.",
      remainingCredits: 0
    };
  }

  const requiredTotalPoints = targetGpa * totalCredits;
  const remainingPoints = requiredTotalPoints - currentPoints;
  const requiredRemainingGPA = remainingPoints / remainingCredits;

  // Grade prediction
  let suggestedGrade = "–";
  let requiredCA = "–";

  if (requiredRemainingGPA >= 3.7) {
    suggestedGrade = "A-";
    requiredCA = "80%+";
  } else if (requiredRemainingGPA >= 3.3) {
    suggestedGrade = "B+";
    requiredCA = "75%+";
  } else if (requiredRemainingGPA >= 3.0) {
    suggestedGrade = "B";
    requiredCA = "70%+";
  } else if (requiredRemainingGPA >= 2.7) {
    suggestedGrade = "B-";
    requiredCA = "65%+";
  } else if (requiredRemainingGPA >= 2.3) {
    suggestedGrade = "C+";
    requiredCA = "60%+";
  } else if (requiredRemainingGPA >= 2.0) {
    suggestedGrade = "C";
    requiredCA = "55%+";
  } else if (requiredRemainingGPA >= 1.0) {
    suggestedGrade = "D";
    requiredCA = "–";
  } else {
    suggestedGrade = "F";
    requiredCA = "–";
  }

  const modules = parseInt(totalModules, 10) || 0;
  const perModulePoints = modules > 0 ? remainingPoints / modules : null;

  return {
    remainingCredits,
    requiredRemainingGPA: parseFloat(requiredRemainingGPA.toFixed(2)),
    remainingPoints: parseFloat(remainingPoints.toFixed(2)),
    requiredCgpa: parseFloat(targetGpa.toFixed(2)),
    perModulePoints: perModulePoints != null ? parseFloat(perModulePoints.toFixed(2)) : null,
    suggestedGrade,
    requiredCA
  };
}

/**
 * Group modules by semester
 * @param {Array} modules - Array of module objects
 * @returns {Object} Grouped modules by semester
 */
function groupModulesBySemester(modules) {
  const semesters = {};

  modules.forEach(module => {
    const sem = module.semester || 1;
    if (!semesters[sem]) {
      semesters[sem] = [];
    }
    semesters[sem].push(module);
  });

  return semesters;
}

/**
 * Calculate overall GPA from all modules
 * @param {Array} modules - Array of module objects
 * @returns {Object} Overall GPA data
 */
function calculateOverallGPA(modules) {
  const gpa = calculateSemesterGPA(modules);
  const credits = modules.reduce((sum, m) => sum + (m.grade_point != null ? m.credits : 0), 0);

  return {
    gpa: parseFloat(gpa.toFixed(2)),
    credits
  };
}

/**
 * Calculate semester-wise GPAs
 * @param {Array} modules - Array of module objects
 * @returns {Array} Array of semester GPA objects
 */
function calculateSemesterWiseGPAs(modules) {
  const grouped = groupModulesBySemester(modules);

  return Object.keys(grouped)
    .map(sem => {
      const semModules = grouped[sem];
      const gpa = calculateSemesterGPA(semModules);
      const credits = semModules.reduce((sum, m) => sum + (m.grade_point != null ? m.credits : 0), 0);

      return {
        semester: parseInt(sem),
        gpa: parseFloat(gpa.toFixed(2)),
        credits,
        modules: semModules
      };
    })
    .sort((a, b) => a.semester - b.semester);
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateSemesterGPA,
    calculateTargetPlan,
    calculateOverallGPA,
    calculateSemesterWiseGPAs,
    groupModulesBySemester,
    GRADE_POINTS
  };
}