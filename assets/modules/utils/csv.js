function protectSpreadsheetFormula(value) {
    const text = String(value ?? '');
    return /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
}

export function escapeCsvCell(value = '', options = {}) {
    const text = options.protectFormula === false ? String(value ?? '') : protectSpreadsheetFormula(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildCsvLine(values = [], options = {}) {
    return values.map((value) => escapeCsvCell(value, options)).join(',');
}
