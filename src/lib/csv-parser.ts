export interface ParsedCsvRow {
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  foil: string;
  rarity: string;
  quantity: number;
  manaBoxId: string;
  scryfallId: string;
  purchasePrice: number;
  misprint: string;
  altered: string;
  condition: string;
  language: string;
}

function parseLine(line: string): string[] {
  const cells: string[] = [];
  let inQuote = false;
  let cell = '';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function parseManaboxCsv(text: string): ParsedCsvRow[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim());

  if (lines.length < 2) throw new Error('CSV appears to be empty.');

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().trim());

  const rows: ParsedCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] || '';
    });

    const quantity = parseInt(row['quantity'] || '1', 10) || 1;

    rows.push({
      name: row['name'] || 'Unknown',
      setCode: row['set code'] || row['set_code'] || '',
      setName: row['set name'] || row['set_name'] || '',
      collectorNumber: row['collector number'] || row['collector_number'] || '',
      foil: row['foil'] || '',
      rarity: row['rarity'] || '',
      quantity,
      manaBoxId: row['manabox id'] || row['manabox_id'] || '',
      scryfallId: row['scryfall id'] || row['scryfall_id'] || '',
      purchasePrice: parseFloat(row['purchase price'] || row['purchase_price'] || '0') || 0,
      misprint: row['misprint'] || '',
      altered: row['altered'] || '',
      condition: row['condition'] || '',
      language: row['language'] || '',
    });
  }

  return rows;
}
