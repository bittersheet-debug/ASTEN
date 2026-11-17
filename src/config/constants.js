/**
 * ASTEN! (ASISTEN TENAGA!) - System Constants
 */

module.exports = {
  APP_NAME: 'ASTEN! (ASISTEN TENAGA!)',
  VERSION: '2.5.0',

  TRANSACTION_STATUS: {
    PENDING: 'PENDING',
    WAITING_PAYMENT: 'WAITING PAYMENT',
    PAID: 'PAID',
    COMPLETED: 'COMPLETED',
    EXPIRED: 'EXPIRED',
    CANCELLED: 'CANCELLED'
  },

  RNK_STATUS: {
    NOT_REQUESTED: 'NOT REQUESTED',
    WAITING: 'WAITING',
    COMPLETED: 'COMPLETED',
    ERROR: 'ERROR'
  },

  RNK_ACTIVATION_STATUS: {
    AKTIF: 'AKTIF',
    BELUM_AKTIF: 'BELUM AKTIF',
    MENUNGGU_ADMIN: 'MENUNGGU ADMIN',
    ERROR: 'ERROR'
  },

  LICENSE_DURATIONS: {
    ONE_MONTH: '1_MONTH',
    THREE_MONTHS: '3_MONTHS',
    SIX_MONTHS: '6_MONTHS',
    ONE_YEAR: '1_YEAR',
    TWO_YEARS: '2_YEARS',
    PERMANENT: 'PERMANENT',
    CUSTOM: 'CUSTOM'
  },

  LICENSE_STATUS: {
    ACTIVE: 'ACTIVE',
    EXPIRED: 'EXPIRED',
    PERMANENT: 'PERMANENT',
    SUSPENDED: 'SUSPENDED'
  },

  CODE_STATUS: {
    UNUSED: 'UNUSED',
    USED: 'USED',
    EXPIRED: 'EXPIRED'
  },

  BOT_STATUS: {
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
    EXPIRED: 'EXPIRED',
    ERROR: 'ERROR'
  },

  GROUP_STATUS: {
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE'
  },

  PAYMENT_METHODS: {
    EWALLET: [
      'DANA',
      'OVO',
      'GoPay',
      'ShopeePay',
      'LinkAja',
      'iSaku',
      'Custom E-Wallet'
    ],
    BANK: [
      'BCA',
      'BRI',
      'BNI',
      'Mandiri',
      'BSI',
      'BTN',
      'CIMB Niaga',
      'Permata',
      'Danamon',
      'SeaBank',
      'Bank Jago',
      'Custom Bank'
    ],
    QRIS: 'QRIS'
  },

  DEFAULT_RNK_CAPTION: 
`Terima kasih sudah berbelanja di toko kami! 💗

Sebelum melanjutkan aktivitas, jangan lupa isi RNK (Rating and Kritik) terlebih dahulu.

Berikan rating, kesan, dan kritik agar pelayanan kami semakin baik.

Silakan isi melalui link berikut:
{LINK_RNK}

Jika sudah mengisi dan berhasil diverifikasi di Group Comment, akses grup kamu akan otomatis dibuka kembali. Terima kasih!`,

  DEFAULT_COMMANDS: [
    '/start',
    '/help',
    '/menu',
    '/price',
    '/search',
    '/product',
    '/stock',
    '/order',
    '/transaction',
    '/payment',
    '/done',
    '/paymentlist',
    '/paymentsettings',
    '/paymentcancel',
    '/settings',
    '/rnk',
    '/admin' // hidden command
  ],

  PAYMENT_COUNTDOWN_MINUTES: 30,
  AUTH_SESSION_MINUTES: 15,
  MAX_LOGIN_ATTEMPTS: 3,
  LOCKOUT_DURATION_MINUTES: 15
};
