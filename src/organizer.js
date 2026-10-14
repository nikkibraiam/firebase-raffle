// Organizer details shown on the public page. These are example values:
// replace them with your own payment accounts and WhatsApp number.
export const organizer = {
  whatsapp: '573000000000',
  whatsappDisplay: '+57 300-000-0000',
  whatsappMessage: 'Hola, quiero participar en La Ruleta. Adjunto mi comprobante de pago.',
  payments: [
    { label: 'Nequi', value: '300 000 0000', copyable: true },
    { label: 'Bancolombia', value: '000-000000-00', name: 'Ahorros · Organizador Demo', copyable: true },
    { label: 'Daviplata', value: '300 000 0000', copyable: true },
    { label: 'Llave Bre-b', value: '@organizador-demo', copyable: false },
  ],
}

export const whatsappLink =
  `https://wa.me/${organizer.whatsapp}?text=${encodeURIComponent(organizer.whatsappMessage)}`
