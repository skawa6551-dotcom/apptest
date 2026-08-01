// ============================================================
// calculator.js
// 電卓の計算ロジックと履歴データを担当するモジュール。
// DOM操作・イベント購読は一切行わない（app.jsの責務）。
// ============================================================

import Storage, { STORAGE_KEYS } from './storage.js';

export const ACTIONS = Object.freeze({
  CLEAR: 'clear',
  NEGATE: 'negate',
  PERCENT: 'percent',
  ADD: 'add',
  SUBTRACT: 'subtract',
  MULTIPLY: 'multiply',
  DIVIDE: 'divide',
  DECIMAL: 'decimal',
  EQUALS: 'equals',
  DIGIT: 'digit',
});

export const ERROR_CODES = Object.freeze({
  DIVISION_BY_ZERO: 'division-by-zero',
  OVERFLOW: 'overflow',
  UNKNOWN_OPERATOR: 'unknown-operator',
  UNKNOWN: 'unknown',
});

const OPERATOR_SYMBOLS = Object.freeze({
  [ACTIONS.ADD]: '＋',
  [ACTIONS.SUBTRACT]: '−',
  [ACTIONS.MULTIPLY]: '×',
  [ACTIONS.DIVIDE]: '÷',
});

const MAX_INPUT_DIGITS = 15;

const RESULT_PRECISION = 12;

export class CalculatorError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CalculatorError';
    this.code = code;
  }
}

function getDecimalPlaces(numStr) {
  if (typeof numStr !== 'string') return 0;
  if (numStr.includes('e') || numStr.includes('E')) return 0;

  const parts = numStr.split('.');
  return parts.length === 2 ? parts[1].length : 0;
}

function roundResult(num, precision = RESULT_PRECISION) {
  if (!Number.isFinite(num)) return num;
  if (num === 0) return 0;
  return parseFloat(num.toPrecision(precision));
}

function formatNumberForInput(num) {
  if (!Number.isFinite(num)) return '0';
  return String(roundResult(num));
}

function appendDigit(currentInput, digit) {
  if (currentInput === '0') {
    return digit === '0' ? '0' : digit;
  }

  const significantDigits = currentInput.replace(/[-.]/g, '').length;
  if (significantDigits >= MAX_INPUT_DIGITS) return currentInput;

  return currentInput + digit;
}

function appendDecimal(currentInput) {
  return currentInput.includes('.') ? currentInput : `${currentInput}.`;
}

function negateInput(currentInput) {
  if (currentInput === '0' || currentInput === '0.') return currentInput;
  return currentInput.startsWith('-') ? currentInput.slice(1) : `-${currentInput}`;
}

export function preciseAdd(a, b) {
  const decimals = Math.max(getDecimalPlaces(String(a)), getDecimalPlaces(String(b)));
  const scale = 10 ** decimals;
  return roundResult((Math.round(a * scale) + Math.round(b * scale)) / scale);
}

export function preciseSubtract(a, b) {
  const decimals = Math.max(getDecimalPlaces(String(a)), getDecimalPlaces(String(b)));
  const scale = 10 ** decimals;
  return roundResult((Math.round(a * scale) - Math.round(b * scale)) / scale);
}

export function preciseMultiply(a, b) {
  const decimalsA = getDecimalPlaces(String(a));
  const decimalsB = getDecimalPlaces(String(b));
  const intA = Math.round(a * 10 ** decimalsA);
  const intB = Math.round(b * 10 ** decimalsB);
  return roundResult((intA * intB) / 10 ** (decimalsA + decimalsB));
}

export function preciseDivide(a, b) {
  if (b === 0) {
    throw new CalculatorError(ERROR_CODES.DIVISION_BY_ZERO);
  }

  const decimals = Math.max(getDecimalPlaces(String(a)), getDecimalPlaces(String(b)));
  const scale = 10 ** decimals;
  const intA = Math.round(a * scale);
  const intB = Math.round(b * scale);
  return roundResult(intA / intB);
}

export function computeOperation(operator, a, b) {
  let result;

  switch (operator) {
    case ACTIONS.ADD:
      result = preciseAdd(a, b);
      break;
    case ACTIONS.SUBTRACT:
      result = preciseSubtract(a, b);
      break;
    case ACTIONS.MULTIPLY:
      result = preciseMultiply(a, b);
      break;
    case ACTIONS.DIVIDE:
      result = preciseDivide(a, b);
      break;
    default:
      throw new CalculatorError(ERROR_CODES.UNKNOWN_OPERATOR);
  }

  if (!Number.isFinite(result)) {
    throw new CalculatorError(ERROR_CODES.OVERFLOW);
  }

  return result;
}

export function calculatePercent(currentInput, previousValue, operator) {
  const value = parseFloat(currentInput);
  if (Number.isNaN(value)) return 0;

  if (previousValue !== null && operator !== null) {
    return preciseDivide(preciseMultiply(previousValue, value), 100);
  }

  return preciseDivide(value, 100);
}

export function createInitialState() {
  return {
    previousValue: null,
    currentInput: '0',
    operator: null,
    overwrite: true,
    isError: false,
    errorCode: null,
    lastOperator: null,
    lastOperand: null,
    lastCalculation: null,
  };
}

function toErrorState(error) {
  const code = error instanceof CalculatorError ? error.code : ERROR_CODES.UNKNOWN;
  return {
    ...createInitialState(),
    isError: true,
    errorCode: code,
  };
}

function applyOperator(state, operator) {
  const currentValue = parseFloat(state.currentInput);

  if (state.operator !== null && state.previousValue !== null && !state.overwrite) {
    try {
      const result = computeOperation(state.operator, state.previousValue, currentValue);
      return {
        ...state,
        previousValue: result,
        currentInput: formatNumberForInput(result),
        operator,
        overwrite: true,
        lastOperator: null,
        lastOperand: null,
        lastCalculation: null,
      };
    } catch (error) {
      return toErrorState(error);
    }
  }

  return {
    ...state,
    previousValue: state.previousValue === null ? currentValue : state.previousValue,
    operator,
    overwrite: true,
    lastOperator: null,
    lastOperand: null,
    lastCalculation: null,
  };
}

function applyEquals(state) {
  let leftOperand;
  let rightOperand;
  let operator = state.operator;

  if (state.operator !== null && !state.overwrite) {
    leftOperand = state.previousValue;
    rightOperand = parseFloat(state.currentInput);
  } else if (state.operator !== null && state.overwrite) {
    leftOperand = state.previousValue;
    rightOperand = state.previousValue;
  } else if (state.operator === null && state.lastOperator !== null) {
    leftOperand = parseFloat(state.currentInput);
    rightOperand = state.lastOperand;
    operator = state.lastOperator;
  } else {
    return state;
  }

  try {
    const result = computeOperation(operator, leftOperand, rightOperand);
    return {
      previousValue: null,
      currentInput: formatNumberForInput(result),
      operator: null,
      overwrite: true,
      isError: false,
      errorCode: null,
      lastOperator: operator,
      lastOperand: rightOperand,
      lastCalculation: { leftOperand, operator, rightOperand, result },
    };
  } catch (error) {
    return toErrorState(error);
  }
}

export function reduce(state, action) {
  if (state.isError && action.type !== ACTIONS.CLEAR) {
    return state;
  }

  switch (action.type) {
    case ACTIONS.CLEAR:
      return createInitialState();

    case ACTIONS.DIGIT:
      return {
        ...state,
        currentInput: state.overwrite
          ? (action.payload === '0' ? '0' : action.payload)
          : appendDigit(state.currentInput, action.payload),
        overwrite: false,
        lastCalculation: null,
      };

    case ACTIONS.DECIMAL:
      return {
        ...state,
        currentInput: state.overwrite ? '0.' : appendDecimal(state.currentInput),
        overwrite: false,
        lastCalculation: null,
      };

    case ACTIONS.NEGATE:
      return {
        ...state,
        currentInput: negateInput(state.currentInput),
        lastCalculation: null,
      };

    case ACTIONS.PERCENT: {
      try {
        const value = calculatePercent(state.currentInput, state.previousValue, state.operator);
        return {
          ...state,
          currentInput: formatNumberForInput(value),
          overwrite: true,
          lastCalculation: null,
        };
      } catch (error) {
        return toErrorState(error);
      }
    }

    case ACTIONS.ADD:
    case ACTIONS.SUBTRACT:
    case ACTIONS.MULTIPLY:
    case ACTIONS.DIVIDE:
      return applyOperator(state, action.type);

    case ACTIONS.EQUALS:
      return applyEquals(state);

    default:
      return state;
  }
}

function buildExpression(leftOperand, operator, rightOperand) {
  const symbol = OPERATOR_SYMBOLS[operator] ?? operator;
  return `${formatNumberForInput(leftOperand)} ${symbol} ${formatNumberForInput(rightOperand)}`;
}

let state = createInitialState();

let history = Storage.get(STORAGE_KEYS.HISTORY, []);

export function input(type, payload) {
  const previousState = state;
  state = reduce(previousState, { type, payload });

  const didCompleteEquals =
    type === ACTIONS.EQUALS &&
    state !== previousState &&
    !state.isError &&
    state.lastCalculation !== null;

  if (didCompleteEquals) {
    const { leftOperand, operator, rightOperand, result } = state.lastCalculation;
    const entry = {
      expression: buildExpression(leftOperand, operator, rightOperand),
      result: formatNumberForInput(result),
      timestamp: Date.now(),
    };
    history = [entry, ...history];
    Storage.set(STORAGE_KEYS.HISTORY, history);
  }

  return getDisplayState();
}

export function getDisplayState() {
  const expression =
    state.operator !== null
      ? `${formatNumberForInput(state.previousValue)} ${OPERATOR_SYMBOLS[state.operator]}`
      : '';

  return {
    expression,
    result: state.currentInput,
    isError: state.isError,
    errorCode: state.errorCode,
  };
}

export function getHistory() {
  return history.map((entry) => ({ ...entry }));
}

export function clearHistory() {
  history = [];
  Storage.remove(STORAGE_KEYS.HISTORY);
}

const Calculator = {
  input,
  getDisplayState,
  getHistory,
  clearHistory,
};

export default Calculator;
