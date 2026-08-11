import { Platform } from 'react-native';

export type DeviceContactPhone = {
  id: string;
  name: string;
  phone: string;
};

/** Lê números da agenda do telemóvel (nativo). Na web devolve lista vazia. */
export async function loadDeviceContactPhones(): Promise<{
  granted: boolean;
  contacts: DeviceContactPhone[];
}> {
  if (Platform.OS === 'web') {
    return { granted: false, contacts: [] };
  }

  try {
    const Contacts = await import('expo-contacts');
    const permission = await Contacts.requestPermissionsAsync();
    if (permission.status !== 'granted') {
      return { granted: false, contacts: [] };
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      pageSize: 2000,
      sort: Contacts.SortTypes.FirstName,
    });

    const contacts: DeviceContactPhone[] = [];
    const seen = new Set<string>();
    for (const contact of data || []) {
      const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim()
        || contact.name
        || '';
      for (const entry of contact.phoneNumbers || []) {
        const phone = String(entry.number || '').replace(/\D/g, '');
        if (phone.length < 7 || seen.has(phone)) continue;
        seen.add(phone);
        contacts.push({
          id: `${contact.id || 'c'}-${phone}`,
          name: name || phone,
          phone,
        });
      }
    }
    return { granted: true, contacts };
  } catch {
    return { granted: false, contacts: [] };
  }
}
