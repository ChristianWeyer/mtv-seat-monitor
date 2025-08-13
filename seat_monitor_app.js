#!/usr/bin/env node

const https = require('https');
const jmespath = require('jmespath');

// Default configuration
const DEFAULT_INTERVAL = 5; // minutes
const API_URL = 'https://booking-service.services.ditix.app/api/public/v1.0/event/prices/?id=3249d4cb-c92b-4c68-bbb3-6a6213b7cbaf&publicKey=e16be350-4367-48d7-861d-00f4645b3cba';
const JMESPATH_EXPRESSION = 'length(seats[?@[3] == `SOLD`])';

class SeatMonitor {
  constructor(intervalMinutes = DEFAULT_INTERVAL) {
    this.intervalMinutes = intervalMinutes;
    this.intervalMs = intervalMinutes * 60 * 1000;
    this.isRunning = false;
    this.timeoutId = null;
    this.previousSoldCount = null;
  }

  async fetchData() {
    return new Promise((resolve, reject) => {
      const request = https.get(API_URL, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            resolve(jsonData);
          } catch (error) {
            reject(new Error(`Failed to parse JSON: ${error.message}`));
          }
        });
      });

      request.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  async checkSoldSeats() {
    const timestamp = new Date().toISOString();
    
    try {
      console.log(`[${timestamp}] Checking sold seats...`);
      
      const data = await this.fetchData();
      const soldCount = jmespath.search(data, JMESPATH_EXPRESSION);
      
      if (this.previousSoldCount !== null) {
        const change = soldCount - this.previousSoldCount;
        const changeText = change > 0 ? `(+${change})` : change < 0 ? `(${change})` : '(no change)';
        console.log(`[${timestamp}] Sold seats: ${soldCount} ${changeText}`);
      } else {
        console.log(`[${timestamp}] Sold seats: ${soldCount}`);
      }
      
      this.previousSoldCount = soldCount;
      
    } catch (error) {
      console.error(`[${timestamp}] Error: ${error.message}`);
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('Monitor is already running');
      return;
    }

    this.isRunning = true;
    console.log(`🎫 MTV Braunschweig - Starting ticket monitor...`);
    console.log(`📊 Monitoring URL: ${API_URL}`);
    console.log(`⏱️  Check interval: ${this.intervalMinutes} minute(s)`);
    console.log(`🔍 JMESPath expression: ${JMESPATH_EXPRESSION}`);
    console.log(`⏹️  Press Ctrl+C to stop\n`);

    // Initial check
    await this.checkSoldSeats();

    // Schedule recurring checks
    const scheduleNext = () => {
      if (this.isRunning) {
        this.timeoutId = setTimeout(async () => {
          await this.checkSoldSeats();
          scheduleNext();
        }, this.intervalMs);
      }
    };

    scheduleNext();
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    console.log('\n🛑 Monitor stopped');
  }
}

function parseArguments() {
  const args = process.argv.slice(2);
  let intervalMinutes = DEFAULT_INTERVAL;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }
    
    if (arg === '--interval' || arg === '-i') {
      const nextArg = args[i + 1];
      if (!nextArg || isNaN(nextArg)) {
        console.error('Error: --interval requires a numeric value (minutes)');
        process.exit(1);
      }
      intervalMinutes = parseFloat(nextArg);
      if (intervalMinutes <= 0) {
        console.error('Error: Interval must be greater than 0');
        process.exit(1);
      }
      i++; // Skip the next argument since we consumed it
    }
  }

  return { intervalMinutes };
}

function showHelp() {
  console.log(`
🎫 Seat Monitor - Track sold seats for events

Usage: node seat-monitor.js [options]

Options:
  -i, --interval <minutes>    Check interval in minutes (default: ${DEFAULT_INTERVAL})
  -h, --help                  Show this help message

Examples:
  node seat-monitor.js                    # Check every 5 minutes (default)
  node seat-monitor.js --interval 2       # Check every 2 minutes
  node seat-monitor.js -i 0.5             # Check every 30 seconds

The monitor tracks sold seats using the JMESPath expression:
${JMESPATH_EXPRESSION}

Press Ctrl+C to stop the monitor.
`);
}

function main() {
  try {
    const { intervalMinutes } = parseArguments();
    const monitor = new SeatMonitor(intervalMinutes);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      monitor.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      monitor.stop();
      process.exit(0);
    });

    // Start monitoring
    monitor.start().catch((error) => {
      console.error('Failed to start monitor:', error.message);
      process.exit(1);
    });

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run the application
if (require.main === module) {
  main();
}

module.exports = { SeatMonitor };