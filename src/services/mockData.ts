import { Transaction } from '../types';
import { categorizationService } from './categorization';

// Generate realistic mock data for a dog rescue organization
export async function generateMockData(): Promise<Transaction[]> {
  await categorizationService.initialize();
  
  const transactions: Transaction[] = [];
  const currentYear = new Date().getFullYear();
  
  // Generate data for current year and previous 2 years
  for (let year = currentYear - 2; year <= currentYear; year++) {
    // Monthly recurring donations
    const donorNames = [
      'Maria Schmidt', 'Hans Müller', 'Petra Weber', 'Klaus Fischer',
      'Sabine Becker', 'Thomas Wagner', 'Anna Hoffmann', 'Michael Schulz'
    ];
    
    for (let month = 0; month < 12; month++) {
      // Skip future months in current year
      if (year === currentYear && month > new Date().getMonth()) break;
      
      // Random donations (3-8 per month)
      const donationCount = 3 + Math.floor(Math.random() * 6);
      for (let i = 0; i < donationCount; i++) {
        const day = 1 + Math.floor(Math.random() * 28);
        const amount = [10, 20, 25, 30, 50, 100, 150, 200][Math.floor(Math.random() * 8)];
        const donor = donorNames[Math.floor(Math.random() * donorNames.length)];
        const descriptions = [
          `Spende für die Hunde`,
          `Spende Tierschutz`,
          `Donation Hundeheim`,
          `Spende für Tierarztkosten`,
          `Geschenk für die Vierbeiner`,
        ];
        const description = descriptions[Math.floor(Math.random() * descriptions.length)];
        
        const { category, confidence } = categorizationService.categorize(description, amount);
        
        transactions.push({
          id: `tx_${year}_${month}_donation_${i}`,
          date: new Date(year, month, day).toISOString(),
          amount,
          type: 'income',
          category,
          description,
          counterparty: donor,
          isManuallyCategized: false,
          confidence,
        });
      }
      
      // Protection fees (1-3 per month)
      const adoptionCount = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < adoptionCount; i++) {
        const day = 1 + Math.floor(Math.random() * 28);
        const amount = [250, 300, 350, 400][Math.floor(Math.random() * 4)];
        const dogNames = ['Luna', 'Max', 'Bella', 'Rocky', 'Mia', 'Bruno', 'Emma', 'Leo'];
        const dogName = dogNames[Math.floor(Math.random() * dogNames.length)];
        const description = `Schutzgebühr ${dogName}`;
        
        const { category, confidence } = categorizationService.categorize(description, amount);
        
        transactions.push({
          id: `tx_${year}_${month}_adoption_${i}`,
          date: new Date(year, month, day).toISOString(),
          amount,
          type: 'income',
          category,
          description,
          counterparty: donorNames[Math.floor(Math.random() * donorNames.length)],
          isManuallyCategized: false,
          confidence,
        });
      }
      
      // Membership fees (beginning of month)
      if (month % 3 === 0) { // Quarterly
        const memberCount = 5 + Math.floor(Math.random() * 10);
        for (let i = 0; i < memberCount; i++) {
          const amount = [30, 50, 60][Math.floor(Math.random() * 3)];
          const description = 'Mitgliedsbeitrag Quartal';
          
          const { category, confidence } = categorizationService.categorize(description, amount);
          
          transactions.push({
            id: `tx_${year}_${month}_member_${i}`,
            date: new Date(year, month, 5).toISOString(),
            amount,
            type: 'income',
            category,
            description,
            counterparty: donorNames[Math.floor(Math.random() * donorNames.length)],
            isManuallyCategized: false,
            confidence,
          });
        }
      }
      
      // Veterinary expenses (2-5 per month)
      const vetCount = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < vetCount; i++) {
        const day = 1 + Math.floor(Math.random() * 28);
        const amount = -1 * [80, 120, 150, 200, 350, 500, 800, 1200][Math.floor(Math.random() * 8)];
        const vetDescriptions = [
          'Tierarzt Impfung',
          'Tierklinik Kastration',
          'Tierärztliche Untersuchung',
          'Tierarzt Notfall',
          'Tiermedizin Behandlung',
        ];
        const description = vetDescriptions[Math.floor(Math.random() * vetDescriptions.length)];
        
        const { category, confidence } = categorizationService.categorize(description, amount);
        
        transactions.push({
          id: `tx_${year}_${month}_vet_${i}`,
          date: new Date(year, month, day).toISOString(),
          amount,
          type: 'expense',
          category,
          description,
          counterparty: ['Tierklinik Nord', 'Dr. Tierlieb', 'Tierarztpraxis Süd'][Math.floor(Math.random() * 3)],
          isManuallyCategized: false,
          confidence,
        });
      }
      
      // Food expenses (1-2 per month)
      const foodCount = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < foodCount; i++) {
        const day = 10 + Math.floor(Math.random() * 10);
        const amount = -1 * [150, 200, 250, 300, 400][Math.floor(Math.random() * 5)];
        const foodDescriptions = [
          'Fressnapf Hundefutter',
          'Zooplus Bestellung',
          'Futterhaus Einkauf',
          'Tierfutter Großeinkauf',
        ];
        const description = foodDescriptions[Math.floor(Math.random() * foodDescriptions.length)];
        
        const { category, confidence } = categorizationService.categorize(description, amount);
        
        transactions.push({
          id: `tx_${year}_${month}_food_${i}`,
          date: new Date(year, month, day).toISOString(),
          amount,
          type: 'expense',
          category,
          description,
          counterparty: ['Fressnapf GmbH', 'Zooplus AG', 'Futterhaus'][Math.floor(Math.random() * 3)],
          isManuallyCategized: false,
          confidence,
        });
      }
      
      // Transport expenses (0-2 per month)
      const transportCount = Math.floor(Math.random() * 3);
      for (let i = 0; i < transportCount; i++) {
        const day = 1 + Math.floor(Math.random() * 28);
        const amount = -1 * [30, 50, 80, 120, 200][Math.floor(Math.random() * 5)];
        const transportDescriptions = [
          'Tankstelle Benzin',
          'Transport Hunde',
          'Fahrtkosten Tierarzt',
        ];
        const description = transportDescriptions[Math.floor(Math.random() * transportDescriptions.length)];
        
        const { category, confidence } = categorizationService.categorize(description, amount);
        
        transactions.push({
          id: `tx_${year}_${month}_transport_${i}`,
          date: new Date(year, month, day).toISOString(),
          amount,
          type: 'expense',
          category,
          description,
          counterparty: ['Shell', 'Aral', 'Total'][Math.floor(Math.random() * 3)],
          isManuallyCategized: false,
          confidence,
        });
      }
      
      // Foster care payments (1-3 per month)
      const fosterCount = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < fosterCount; i++) {
        const day = 1 + Math.floor(Math.random() * 5);
        const amount = -1 * [100, 150, 200, 250][Math.floor(Math.random() * 4)];
        const description = 'Pflegestelle Aufwandsentschädigung';
        
        const { category, confidence } = categorizationService.categorize(description, amount);
        
        transactions.push({
          id: `tx_${year}_${month}_foster_${i}`,
          date: new Date(year, month, day).toISOString(),
          amount,
          type: 'expense',
          category,
          description,
          counterparty: donorNames[Math.floor(Math.random() * donorNames.length)],
          isManuallyCategized: false,
          confidence,
        });
      }
      
      // Administration expenses (1 per month)
      const adminAmount = -1 * [20, 30, 50, 80][Math.floor(Math.random() * 4)];
      const adminDescriptions = [
        'Porto Versand',
        'Büromaterial',
        'Bankgebühren',
        'Versicherung Verein',
      ];
      const adminDescription = adminDescriptions[Math.floor(Math.random() * adminDescriptions.length)];
      
      const { category: adminCat, confidence: adminConf } = categorizationService.categorize(adminDescription, adminAmount);
      
      transactions.push({
        id: `tx_${year}_${month}_admin`,
        date: new Date(year, month, 28).toISOString(),
        amount: adminAmount,
        type: 'expense',
        category: adminCat,
        description: adminDescription,
        counterparty: ['Deutsche Post', 'Sparkasse', 'Allianz'][Math.floor(Math.random() * 3)],
        isManuallyCategized: false,
        confidence: adminConf,
      });
    }
  }
  
  // Sort by date (newest first)
  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  return transactions;
}
