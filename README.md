# 🌳 Ved Upvan Park - Smart Ticketing & Gate Pass System
**Nagar Palika Parishad, Sirsaganj**  
*Address: Etawah Road, Sirsaganj, Firozabad - 205151*

---

## 🔐 3 Dedicated Role-Based Logins

The application is completely secured with role-based access control (RBAC). When you open the app, you see a modern login screen with 3 quick-access roles (or manual email/password):

| Role | Username / Email | Password | Allowed Capabilities |
| :--- | :--- | :--- | :--- |
| **1. Ticket Counter** | `counter1@vedupvan.local` | `counter@123` | **Ticket Generation & Printing ONLY**.<br>• Generate Entry Tickets (1-20+ persons)<br>• Monthly & Family Subscription Passes<br>• 3-Inch Bluetooth / USB Thermal Printing<br>*(Cannot scan tickets or view revenue reports)* |
| **2. Gate Security** | `gate1@vedupvan.local` | `gate@123` | **Gate Scanner ONLY**.<br>• Mobile camera / webcam / USB barcode gun QR scan<br>• Instant verification & one-time ticket burning (`USED`)<br>• Pass cooldown & date validity checks<br>*(Cannot generate tickets or view financial reports)* |
| **3. Park Admin** | `admin@vedupvan.local` | `admin@123` | **Full Admin Dashboard & Reports**.<br>• Real-time revenue & daily collection<br>• Total visitors admitted today<br>• Real-time gate audit logs (`vup.entry_events`)<br>• Hardware settings & rate configuration |

---

## 🚀 Live Testing URLs

- **Desktop/Laptop Web**: [http://localhost:5173/](http://localhost:5173/)
- **Mobile Access (Same Wi-Fi)**: `http://192.168.1.6:5173/`

---

## 🖨️ 3-Inch (76.20mm) Thermal Printing
- Fixed Header: `Ved Upvan Park (Nagar Palika Parishid)`, `Etawah Road, Sirsaganj, Firozabad - 205151`
- Dynamic Fields: Real-time IST date & time, dynamic persons count, unique ticket number (`VUP-T-YYYYMMDD-000001`), payment mode (Cash/UPI).
- 40mm High-Contrast QR Code embedding tamper-proof encrypted token.
- Direct Web Bluetooth connectivity to 80mm wireless thermal printers.

---

## 🗄️ Supabase Free Tier Status
- **Connected Project**: `QR Ticket System` (`kzuxtkxdhyrowgczrhwa`)
- **Postgres Schema**: `vup` (16 tables active, atomic `vup.admit_visitor` & `vup.staff_login` RPC functions deployed).
