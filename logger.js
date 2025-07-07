// logger.js - Centralized Logging Utility

// === Debug 控制系統 ===
// Set to true for development, false for production
const DEBUG_MODE = true; 

const Logger = {
  // Error messages - always displayed
  error: (...args) => console.error(...args),
  
  // Warning messages - always displayed  
  warn: (...args) => console.warn(...args),
  
  // Info messages - always displayed
  info: (...args) => {console.log(...args)},
  
  // Debug messages - only displayed in DEBUG_MODE
  debug: (...args) => {
    if (DEBUG_MODE) console.log(...args);
  },
  
  // Verbose debug messages - only displayed in DEBUG_MODE
  verbose: (...args) => {
    if (DEBUG_MODE) console.log(...args);
  }
};


