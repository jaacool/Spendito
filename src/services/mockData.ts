import { Transaction, SourceAccount } from '../types';
import { categorizationService } from './categorization';
import { duplicateDetectionService } from './duplicateDetection';

// Helper to create a transaction
function createTransaction(
  id: string,
  date: Date,
  amount: number,
  type: 'income' | 'expense',
  category: any,
  description: string,
  counterparty: string,
  confidence: number,
  sourceAccount: SourceAccount,
  externalId?: string
): Transaction {
  return {
    id,
    date: date.toISOString(),
    amount,
    type,
    category,
    description,
    counterparty,
    isManuallyCategized: false,
    confidence,
    sourceAccount,
    externalId,
  };
}

// Generate realistic mock data for a dog rescue organization with multi-account support
export async function generateMockData(): Promise<Transaction[]> {
  await categorizationService.initialize();
  
  const transactions: Transaction[] = [];
  const currentYear = new Date().getFullYear();
  
  const donorNames = [
    'Maria Schmidt', 'Hans Müller', 'Petra Weber', 'Klaus Fischer',
    'Sabine Becker', 'Thomas Wagner', 'Anna Hoffmann', 'Michael Schulz'
  ];
  
  // Generate data for current year and previous 2 years
  for (let year = currentYear - 2; year <= currentYear; year++) {
    for (let month = 0; month < 12; month++) {
      // Skip future months in current year
      if (year === currentYear && month > new Date().getMonth()) break;
      
      // ========== VOLKSBANK TRANSACTIONS ==========
      
      // Donations via bank transfer (Volksbank)
      const bankDonationCount = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < bankDonationCount; i++) {
        const day = 1 + Math.floor(Math.random() * 28);
        const amount = [20, 30, 50, 100, 150][Math.floor(Math.random() * 5)];
        const donor = donorNames[Math.floor(Math.random() * donorNames.length)];
        const description = `Spende für die Hunde`;
        
        const { category, confidence } = categorizationService.categorize(description, amount);
        
        transactions.push(createTransaction(
          `vb_${year}_${month}_donation_${i}`,
          new Date(year, month, day),
          amount,
          'income',
          category,
          description,
          donor,
          confidence,
          'volksbank',
          `VB${year}${month}${day}${i}`
        ));
      }
      
      // Protection fees (always Volksbank)
      const adoptionCount = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < adoptionCount; i++) {
        const day = 1 + Math.floor(Math.random() * 28);
        const amount = [250, 300, 350, 400][Math.floor(Math.random() * 4)];
        const dogNames = ['Luna', 'Max', 'Bella', 'Rocky', 'Mia', 'Bruno', 'Emma', 'Leo'];
        const dogName = dogNames[Math.floor(Math.random() * dogNames.length)];
        const description = `Schutzgebühr ${dogName}`;
        
        const { category, confidence } = categorizationService.categorize(description, amount);
        
        transactions.push(createTransaction(
          `vb_${year}_${month}_adoption_${i}`,
          new Date(year, month, day),
          amount,
          'income',
          category,
          description,
          donorNames[Math.floor(Math.random() * donorNames.length)],
          confidence,
          'volksbank'
        ));
      }
      
      // Membership fees (Volksbank)
      if (month % 3 === 0) {
        const memberCount = 5 + Math.floor(Math.random() * 10);
        for (let i = 0; i < memberCount; i++) {
          const amount = [30, 50, 60][Math.floor(Math.random() * 3)];
          const description = 'Mitgliedsbeitrag Quartal';
          
          const { category, confidence } = categorizationService.categorize(description, amount);
          
          transactions.push(createTransaction(
            `vb_${year}_${month}_member_${i}`,
            new Date(year, month, 5),
            amount,
            'income',
            category,
            description,
            donorNames[Math.floor(Math.random() * donorNames.length)],
            confidence,
            'volksbank'
          ));
        }
      }
      
      // Veterinary expenses (Volksbank - direct payment)
      const vetCountVB = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < vetCountVB; i++) {
        const day = 1 + Math.floor(Math.random() * 28);
        const amount = -1 * [200, 350, 500, 800][Math.floor(Math.random() * 4)];
        const description = 'Tierarzt Behandlung';
        
        const { category, confidence } = categorizationService.categorize(description, amount);
        
        transactions.push(createTransaction(
          `vb_${year}_${month}_vet_${i}`,
          new Date(year, month, day),
          amount,
          'expense',
          category,
          description,
          ['Tierklinik Nord', 'Dr. Tierlieb'][Math.floor(Math.random() * 2)],
          confidence,
          'volksbank'
        ));
      }
      
      // Foster care payments (Volksbank)
      const fosterCount = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < fosterCount; i++) {
        const day = 1 + Math.floor(Math.random() * 5);
        const amount = -1 * [100, 150, 200][Math.floor(Math.random() * 3)];
        const description = 'Pflegestelle Aufwandsentschädigung';
        
        const { category, confidence } = categorizationService.categorize(description, amount);
        
        transactions.push(createTransaction(
          `vb_${year}_${month}_foster_${i}`,
          new Date(year, month, day),
          amount,
          'expense',
          category,
          description,
          donorNames[Math.floor(Math.random() * donorNames.length)],
          confidence,
          'volksbank'
        ));
      }
      
      // Administration (Volksbank)
      const adminAmount = -1 * [20, 30, 50][Math.floor(Math.random() * 3)];
      const adminDescriptions = ['Porto Versand', 'Bankgebühren', 'Versicherung Verein'];
      const adminDescription = adminDescriptions[Math.floor(Math.random() * adminDescriptions.length)];
      
      const { category: adminCat, confidence: adminConf } = categorizationService.categorize(adminDescription, adminAmount);
      
      transactions.push(createTransaction(
        `vb_${year}_${month}_admin`,
        new Date(year, month, 28),
        adminAmount,
        'expense',
        adminCat,
        adminDescription,
        ['Deutsche Post', 'Volksbank'][Math.floor(Math.random() * 2)],
        adminConf,
        'volksbank'
      ));
      
      // ========== PAYPAL TRANSACTIONS ==========
      
      // PayPal donations (smaller amounts, more frequent)
      const paypalDonationCount = 2 + Math.floor(Math.random() * 5);
      for (let i = 0; i < paypalDonationCount; i++) {
        const day = 1 + Math.floor(Math.random() * 28);
        const amount = [5, 10, 15, 20, 25, 50][Math.floor(Math.random() * 6)];
        const donor = donorNames[Math.floor(Math.random() * donorNames.length)];
        const description = 'Spende Tierschutz';
        
        const { category, confidence } = categorizationService.categorize(description, amount);
        
        transactions.push(createTransaction(
          `pp_${year}_${month}_donation_${i}`,
          new Date(year, month, day),
          amount,
          'income',
          category,
          description,
          donor,
          confidence,
          'paypal',
          `PP${year}${month}${day}${i}`
        ));
      }
      
      // PayPal purchases (Zooplus, etc.) - these will have duplicates in Volksbank
      const paypalPurchaseCount = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < paypalPurchaseCount; i++) {
        const day = 10 + Math.floor(Math.random() * 10);
        const amount = -1 * [45.99, 89.50, 125.00, 67.80][Math.floor(Math.random() * 4)];
        const descriptions = ['Zooplus Bestellung', 'Fressnapf Online', 'Tierbedarf'];
        const description = descriptions[Math.floor(Math.random() * descriptions.length)];
        
        const { category, confidence } = categorizationService.categorize(description, amount);
        const paypalTxId = `PP${year}${month}${day}PURCHASE${i}`;
        
        // PayPal transaction (primary - shows merchant)
        transactions.push(createTransaction(
          `pp_${year}_${month}_purchase_${i}`,
          new Date(year, month, day),
          amount,
          'expense',
          category,
          description,
          'Zooplus AG',
          confidence,
          'paypal',
          paypalTxId
        ));
        
        // Corresponding Volksbank transaction (duplicate - shows "PayPal")
        // This appears 1-2 days later
        const vbDay = Math.min(day + 1 + Math.floor(Math.random() * 2), 28);
        transactions.push(createTransaction(
          `vb_${year}_${month}_paypal_${i}`,
          new Date(year, month, vbDay),
          amount,
          'expense',
          category,
          `PAYPAL *ZOOPLUS`,
          'PayPal Europe S.a.r.l.',
          confidence,
          'volksbank',
          `VB_PP_${paypalTxId}`
        ));
      }
      
      // Transport via PayPal (some gas stations accept PayPal)
      if (Math.random() > 0.5) {
        const day = 1 + Math.floor(Math.random() * 28);
        const amount = -1 * [35, 50, 65, 80][Math.floor(Math.random() * 4)];
        const description = 'Tankstelle Benzin';
        
        const { category, confidence } = categorizationService.categorize(description, amount);
        
        transactions.push(createTransaction(
          `pp_${year}_${month}_transport`,
          new Date(year, month, day),
          amount,
          'expense',
          category,
          description,
          'Shell Station',
          confidence,
          'paypal'
        ));
      }
    }
  }
  
  // Sort by date (newest first)
  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  // Auto-detect and mark duplicates
  const processedTransactions = duplicateDetectionService.markDuplicates(transactions);
  
  return processedTransactions;
}
