import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { Transaction, YearSummary, CATEGORY_INFO, Category } from '../types';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface ExportOptions {
  year: number;
  transactions: Transaction[];
  yearSummary: YearSummary;
  organizationName: string;
}

export class FinanzamtExportService {
  async generatePDF(options: ExportOptions): Promise<void> {
    const html = this.generateHTML(options);
    
    try {
      const fileName = `Finanzamt_Export_${options.organizationName.replace(/\s+/g, '_')}_${options.year}.html`;
      
      if (Platform.OS === 'web') {
        // Web/Electron Export
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        // Native Export (iOS/Android)
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, html, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/html',
            dialogTitle: `Finanzamt Export ${options.year}`,
          });
        }
      }
    } catch (error) {
      console.error('PDF Export Error:', error);
      throw new Error('Export fehlgeschlagen');
    }
  }

  private generateHTML(options: ExportOptions): string {
    const { year, transactions, yearSummary, organizationName } = options;
    const exportDate = format(new Date(), 'dd.MM.yyyy', { locale: de });

    return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Finanzamt Export ${year}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1f2937;
      padding: 40px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #3b82f6;
    }
    .header h1 {
      font-size: 24pt;
      color: #1e40af;
      margin-bottom: 10px;
    }
    .header .subtitle {
      font-size: 14pt;
      color: #6b7280;
      margin-bottom: 5px;
    }
    .header .export-info {
      font-size: 10pt;
      color: #9ca3af;
      margin-top: 10px;
    }
    .section {
      margin-bottom: 40px;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 16pt;
      font-weight: bold;
      color: #1e40af;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e5e7eb;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 30px;
    }
    .summary-card {
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #3b82f6;
    }
    .summary-card.income { border-left-color: #22c55e; }
    .summary-card.expense { border-left-color: #ef4444; }
    .summary-card.balance { border-left-color: #8b5cf6; }
    .summary-card .label {
      font-size: 10pt;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }
    .summary-card .value {
      font-size: 20pt;
      font-weight: bold;
      color: #1f2937;
    }
    .summary-card .count {
      font-size: 9pt;
      color: #9ca3af;
      margin-top: 5px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
      background: white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    th {
      background: #f3f4f6;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #374151;
      border-bottom: 2px solid #e5e7eb;
      font-size: 10pt;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #f3f4f6;
      font-size: 10pt;
    }
    tr:hover {
      background: #f9fafb;
    }
    .amount {
      text-align: right;
      font-weight: 600;
      font-family: 'Courier New', monospace;
    }
    .amount.positive { color: #22c55e; }
    .amount.negative { color: #ef4444; }
    .category-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 9pt;
      font-weight: 500;
      background: #e5e7eb;
      color: #374151;
    }
    .total-row {
      font-weight: bold;
      background: #f9fafb !important;
      border-top: 2px solid #e5e7eb;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      font-size: 9pt;
      color: #6b7280;
    }
    @media print {
      body { padding: 20px; }
      .section { page-break-inside: avoid; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Finanzamt Export</h1>
    <div class="subtitle">${organizationName}</div>
    <div class="subtitle">Geschäftsjahr ${year}</div>
    <div class="export-info">Erstellt am ${exportDate} | Spendito Finanzverwaltung</div>
  </div>

  <!-- Jahresübersicht -->
  <div class="section">
    <h2 class="section-title">1. Jahresübersicht ${year}</h2>
    <div class="summary-grid">
      <div class="summary-card income">
        <div class="label">Gesamteinnahmen</div>
        <div class="value">${this.formatCurrency(yearSummary.totalIncome)}</div>
        <div class="count">${yearSummary.incomeByCategory.reduce((sum, cat) => sum + cat.count, 0)} Transaktionen</div>
      </div>
      <div class="summary-card expense">
        <div class="label">Gesamtausgaben</div>
        <div class="value">${this.formatCurrency(Math.abs(yearSummary.totalExpense))}</div>
        <div class="count">${yearSummary.expenseByCategory.reduce((sum, cat) => sum + cat.count, 0)} Transaktionen</div>
      </div>
      <div class="summary-card balance">
        <div class="label">Jahressaldo</div>
        <div class="value">${this.formatCurrency(yearSummary.balance)}</div>
        <div class="count">Einnahmen - Ausgaben</div>
      </div>
    </div>
  </div>

  <!-- Einnahmen nach Kategorien -->
  <div class="section">
    <h2 class="section-title">2. Einnahmen nach Kategorien</h2>
    <table>
      <thead>
        <tr>
          <th>Kategorie</th>
          <th style="text-align: right;">Anzahl</th>
          <th style="text-align: right;">Betrag</th>
          <th style="text-align: right;">Anteil</th>
        </tr>
      </thead>
      <tbody>
        ${yearSummary.incomeByCategory
          .sort((a, b) => b.total - a.total)
          .map(cat => `
            <tr>
              <td>
                <span class="category-badge">${CATEGORY_INFO[cat.category].labelDe}</span>
              </td>
              <td class="amount">${cat.count}</td>
              <td class="amount positive">${this.formatCurrency(cat.total)}</td>
              <td class="amount">${cat.percentage.toFixed(1)}%</td>
            </tr>
          `).join('')}
        <tr class="total-row">
          <td>Summe Einnahmen</td>
          <td class="amount">${yearSummary.incomeByCategory.reduce((sum, cat) => sum + cat.count, 0)}</td>
          <td class="amount positive">${this.formatCurrency(yearSummary.totalIncome)}</td>
          <td class="amount">100.0%</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Ausgaben nach Kategorien -->
  <div class="section">
    <h2 class="section-title">3. Ausgaben nach Kategorien</h2>
    <table>
      <thead>
        <tr>
          <th>Kategorie</th>
          <th style="text-align: right;">Anzahl</th>
          <th style="text-align: right;">Betrag</th>
          <th style="text-align: right;">Anteil</th>
        </tr>
      </thead>
      <tbody>
        ${yearSummary.expenseByCategory
          .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
          .map(cat => `
            <tr>
              <td>
                <span class="category-badge">${CATEGORY_INFO[cat.category].labelDe}</span>
              </td>
              <td class="amount">${cat.count}</td>
              <td class="amount negative">${this.formatCurrency(Math.abs(cat.total))}</td>
              <td class="amount">${cat.percentage.toFixed(1)}%</td>
            </tr>
          `).join('')}
        <tr class="total-row">
          <td>Summe Ausgaben</td>
          <td class="amount">${yearSummary.expenseByCategory.reduce((sum, cat) => sum + cat.count, 0)}</td>
          <td class="amount negative">${this.formatCurrency(Math.abs(yearSummary.totalExpense))}</td>
          <td class="amount">100.0%</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Detaillierte Transaktionsliste -->
  <div class="section">
    <h2 class="section-title">4. Detaillierte Transaktionsliste</h2>
    ${this.generateTransactionTables(transactions)}
  </div>

  <div class="footer">
    <p><strong>Hinweis:</strong> Dieser Export wurde automatisch von Spendito generiert.</p>
    <p>Alle Angaben ohne Gewähr. Bitte prüfen Sie die Daten vor der Weitergabe an das Finanzamt.</p>
    <p style="margin-top: 10px;">© ${year} ${organizationName}</p>
  </div>
</body>
</html>
    `.trim();
  }

  private generateTransactionTables(transactions: Transaction[]): string {
    const filteredTransactions = transactions.filter(t => !t.isDuplicate && !t.isGuthabenTransfer);
    const sortedTransactions = [...filteredTransactions].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const incomeTransactions = sortedTransactions.filter(t => t.type === 'income');
    const expenseTransactions = sortedTransactions.filter(t => t.type === 'expense');

    return `
      <h3 style="margin-top: 20px; color: #22c55e;">Einnahmen (${incomeTransactions.length} Transaktionen)</h3>
      <table>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Kategorie</th>
            <th>Beschreibung</th>
            <th>Von/An</th>
            <th style="text-align: right;">Betrag</th>
          </tr>
        </thead>
        <tbody>
          ${incomeTransactions.map(t => `
            <tr>
              <td>${format(new Date(t.date), 'dd.MM.yyyy', { locale: de })}</td>
              <td><span class="category-badge">${CATEGORY_INFO[t.category].labelDe}</span></td>
              <td>${this.escapeHtml(t.description)}</td>
              <td>${this.escapeHtml(t.counterparty)}</td>
              <td class="amount positive">${this.formatCurrency(t.amount)}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="4">Summe Einnahmen</td>
            <td class="amount positive">${this.formatCurrency(incomeTransactions.reduce((sum, t) => sum + t.amount, 0))}</td>
          </tr>
        </tbody>
      </table>

      <h3 style="margin-top: 30px; color: #ef4444;">Ausgaben (${expenseTransactions.length} Transaktionen)</h3>
      <table>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Kategorie</th>
            <th>Beschreibung</th>
            <th>Von/An</th>
            <th style="text-align: right;">Betrag</th>
          </tr>
        </thead>
        <tbody>
          ${expenseTransactions.map(t => `
            <tr>
              <td>${format(new Date(t.date), 'dd.MM.yyyy', { locale: de })}</td>
              <td><span class="category-badge">${CATEGORY_INFO[t.category].labelDe}</span></td>
              <td>${this.escapeHtml(t.description)}</td>
              <td>${this.escapeHtml(t.counterparty)}</td>
              <td class="amount negative">${this.formatCurrency(Math.abs(t.amount))}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="4">Summe Ausgaben</td>
            <td class="amount negative">${this.formatCurrency(Math.abs(expenseTransactions.reduce((sum, t) => sum + t.amount, 0)))}</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

export const finanzamtExportService = new FinanzamtExportService();
