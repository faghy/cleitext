import { describe, expect, it } from 'vitest';
import { messageNotification } from './push';

describe('messageNotification', () => {
  it('uses the fields of a custom form when there is no message', () => {
    const n = messageNotification({
      id: 'm1',
      formName: 'Booking',
      name: '',
      email: '',
      message: '',
      data: [
        { name: 'mail', label: 'Email', type: 'email', value: 'ada@example.com' },
        { name: 'nights', label: 'Nights', type: 'text', value: '3' },
        { name: 'notes', label: 'Notes', type: 'textarea', value: 'Sea view' },
      ],
    } as never);
    expect(n.body).toBe('ada@example.com: 3 · Sea view');
    expect(n.title).toEqual({ en: 'New message — Booking', it: 'Nuovo messaggio — Booking' });
  });

  it('keeps the text short', () => {
    const n = messageNotification({
      id: 'm1',
      formName: 'Contact',
      name: 'Ada',
      email: 'ada@example.com',
      message: 'x'.repeat(1000),
      data: null,
    });
    expect(String(n.body).length).toBe(300);
  });
});
