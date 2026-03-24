import asyncio
from datetime import datetime, timezone, timedelta

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.core.security import get_password_hash


async def seed() -> None:
    client = AsyncIOMotorClient(settings.mongo_uri)
    db = client[settings.mongo_db]

    for name in [
        "companies", "units", "users", "incident_types", "incidents",
        "components", "skills", "technicians", "tools", "licenses",
        "vehicles", "dispatch_runs",
    ]:
        await db[name].delete_many({})

    # ------------------------------------------------------------------ company
    company = {
        "name": "Acme Logistics",
        "createdAt": datetime.now(timezone.utc),
        "hqLocation": {"lat": 10.7769, "lng": 106.7009, "address": "HQ - Ho Chi Minh"},
    }
    company_id = (await db.companies.insert_one(company)).inserted_id
    cid = str(company_id)

    # ------------------------------------------------------------------ units
    units_data = [
        {
            "companyId": cid,
            "name": "Tram ho tro HCMC",
            "location": {"lat": 10.7769, "lng": 106.7009, "address": "123 Nguyen Hue, Q1, HCMC"},
            "remoteAccessReady": True,
            "isSupportStation": True,
        },
        {
            "companyId": cid,
            "name": "Don vi B - Ha Noi",
            "location": {"lat": 21.0285, "lng": 105.8542, "address": "45 Tran Hung Dao, Hoan Kiem, Ha Noi"},
            "remoteAccessReady": True,
            "isSupportStation": False,
        },
        {
            "companyId": cid,
            "name": "Don vi C - Da Nang",
            "location": {"lat": 16.0544, "lng": 108.2022, "address": "12 Bach Dang, Hai Chau, Da Nang"},
            "remoteAccessReady": False,
            "isSupportStation": False,
        },
        {
            "companyId": cid,
            "name": "Don vi D - Can Tho",
            "location": {"lat": 10.0452, "lng": 105.7469, "address": "88 Nguyen Trai, Ninh Kieu, Can Tho"},
            "remoteAccessReady": True,
            "isSupportStation": False,
        },
        {
            "companyId": cid,
            "name": "Don vi E - Hai Phong",
            "location": {"lat": 20.8449, "lng": 106.6881, "address": "22 Tran Phu, Le Chan, Hai Phong"},
            "remoteAccessReady": False,
            "isSupportStation": False,
        },
    ]
    unit_ids = (await db.units.insert_many(units_data)).inserted_ids
    u = [str(i) for i in unit_ids]

    # ------------------------------------------------------------------ users
    await db.users.insert_one({
        "email": "admin@acme.local",
        "passwordHash": get_password_hash("admin123"),
        "role": "COMPANY_ADMIN",
        "companyId": cid,
        "unitId": None,
    })
    unit_users = [
        ("unit1@acme.local", u[0]),
        ("unit2@acme.local", u[1]),
        ("unit3@acme.local", u[2]),
        ("unit4@acme.local", u[3]),
        ("unit5@acme.local", u[4]),
    ]
    await db.users.insert_many([
        {
            "email": email,
            "passwordHash": get_password_hash("unit123"),
            "role": "UNIT_USER",
            "companyId": cid,
            "unitId": uid,
        }
        for email, uid in unit_users
    ])

    # ------------------------------------------------------------------ skills
    skills_data = [
        {"companyId": cid, "name": "server"},
        {"companyId": cid, "name": "web"},
        {"companyId": cid, "name": "network"},
        {"companyId": cid, "name": "malware"},
        {"companyId": cid, "name": "database"},
        {"companyId": cid, "name": "firewall"},
    ]
    await db.skills.insert_many(skills_data)

    # ------------------------------------------------------------------ incident_types
    incident_types = [
        {
            "code": "SERVER_NO_BOOT",
            "name": "May chu khong khoi dong",
            "defaultPriority": 4,
            "defaultSetupRemote": 0.5,
            "defaultFeasRemote": True,
            "defaultFeasOnsite": True,
            "requirements": {
                "requiredSkills": ["server"],
                "requiredToolsByMode": {"R": ["BOOT_DISK"], "O": ["BOOT_DISK"]},
                "requiredLicensesByMode": {"R": [], "O": []},
                "requiresVehicleIfOnsite": True,
            },
        },
        {
            "code": "WEB_DOWN",
            "name": "Website/Dich vu web bi ngung",
            "defaultPriority": 3,
            "defaultSetupRemote": 0.25,
            "defaultFeasRemote": True,
            "defaultFeasOnsite": True,
            "requirements": {
                "requiredSkills": ["web"],
                "requiredToolsByMode": {"R": [], "O": ["SWITCH_TOOL"]},
                "requiredLicensesByMode": {"R": ["NETDIAG_SUITE"], "O": ["NETDIAG_SUITE"]},
                "requiresVehicleIfOnsite": False,
            },
        },
        {
            "code": "MALWARE_SPREAD",
            "name": "Lan truyen ma doc / ransomware",
            "defaultPriority": 4,
            "defaultSetupRemote": 0.75,
            "defaultFeasRemote": True,
            "defaultFeasOnsite": True,
            "requirements": {
                "requiredSkills": ["malware"],
                "requiredToolsByMode": {"R": ["FORENSIC_KIT"], "O": ["FORENSIC_KIT"]},
                "requiredLicensesByMode": {"R": ["SECURE_SCAN"], "O": ["SECURE_SCAN"]},
                "requiresVehicleIfOnsite": True,
            },
        },
        {
            "code": "ROUTING_OUT",
            "name": "Mat ket noi mang / routing",
            "defaultPriority": 3,
            "defaultSetupRemote": 0.4,
            "defaultFeasRemote": False,
            "defaultFeasOnsite": True,
            "requirements": {
                "requiredSkills": ["network"],
                "requiredToolsByMode": {"R": [], "O": ["ROUTER_TOOL"]},
                "requiredLicensesByMode": {"R": [], "O": []},
                "requiresVehicleIfOnsite": True,
            },
        },
        {
            "code": "DB_CORRUPT",
            "name": "Co so du lieu bi hong / mat du lieu",
            "defaultPriority": 4,
            "defaultSetupRemote": 1.0,
            "defaultFeasRemote": True,
            "defaultFeasOnsite": True,
            "requirements": {
                "requiredSkills": ["database"],
                "requiredToolsByMode": {"R": ["BACKUP_TOOL"], "O": ["BACKUP_TOOL"]},
                "requiredLicensesByMode": {"R": ["DB_RECOVERY"], "O": ["DB_RECOVERY"]},
                "requiresVehicleIfOnsite": False,
            },
        },
        {
            "code": "FIREWALL_BREACH",
            "name": "Tuong lua bi xam pham / canh bao xam nhap",
            "defaultPriority": 4,
            "defaultSetupRemote": 0.5,
            "defaultFeasRemote": True,
            "defaultFeasOnsite": True,
            "requirements": {
                "requiredSkills": ["firewall", "network"],
                "requiredToolsByMode": {"R": ["FORENSIC_KIT"], "O": ["FORENSIC_KIT"]},
                "requiredLicensesByMode": {"R": ["SECURE_SCAN"], "O": ["SECURE_SCAN"]},
                "requiresVehicleIfOnsite": False,
            },
        },
        {
            "code": "POWER_FAIL",
            "name": "Mat nguon / su co dien",
            "defaultPriority": 2,
            "defaultSetupRemote": 0.0,
            "defaultFeasRemote": False,
            "defaultFeasOnsite": True,
            "requirements": {
                "requiredSkills": ["server"],
                "requiredToolsByMode": {"R": [], "O": []},
                "requiredLicensesByMode": {"R": [], "O": []},
                "requiresVehicleIfOnsite": True,
            },
        },
    ]
    await db.incident_types.insert_many(incident_types)
    itype_map = {t["code"]: t for t in incident_types}

    # ------------------------------------------------------------------ tools
    tools_data = [
        {"companyId": cid, "name": "Boot Disk",    "typeCode": "BOOT_DISK",    "availableQty": 2},
        {"companyId": cid, "name": "Forensic Kit", "typeCode": "FORENSIC_KIT", "availableQty": 2},
        {"companyId": cid, "name": "Router Tool",  "typeCode": "ROUTER_TOOL",  "availableQty": 2},
        {"companyId": cid, "name": "Switch Tool",  "typeCode": "SWITCH_TOOL",  "availableQty": 2},
        {"companyId": cid, "name": "Backup Tool",  "typeCode": "BACKUP_TOOL",  "availableQty": 2},
    ]
    await db.tools.insert_many(tools_data)

    # ------------------------------------------------------------------ licenses
    licenses_data = [
        {"companyId": cid, "name": "NetDiag Suite",  "typeCode": "NETDIAG_SUITE", "capTotal": 3, "inUseNow": 0},
        {"companyId": cid, "name": "Secure Scan",    "typeCode": "SECURE_SCAN",   "capTotal": 3, "inUseNow": 0},
        {"companyId": cid, "name": "DB Recovery Pro","typeCode": "DB_RECOVERY",   "capTotal": 2, "inUseNow": 0},
    ]
    await db.licenses.insert_many(licenses_data)

    # ------------------------------------------------------------------ vehicles
    await db.vehicles.insert_one({"companyId": cid, "availableQty": 3})

    # ------------------------------------------------------------------ technicians
    technicians_data = [
        {
            "companyId": cid,
            "name": "Nguyen Van An",
            "skills": ["server", "malware", "network"],
            "availableNow": True,
            "homeLocation": {"lat": 10.7769, "lng": 106.7009, "address": "HCMC"},
            "dMatrix": [
                {"typeCode": "SERVER_NO_BOOT", "mode": "R", "durationHours": 2.0},
                {"typeCode": "SERVER_NO_BOOT", "mode": "O", "durationHours": 3.5},
                {"typeCode": "MALWARE_SPREAD", "mode": "R", "durationHours": 3.0},
                {"typeCode": "MALWARE_SPREAD", "mode": "O", "durationHours": 5.0},
                {"typeCode": "ROUTING_OUT",    "mode": "O", "durationHours": 2.5},
                {"typeCode": "POWER_FAIL",     "mode": "O", "durationHours": 1.5},
            ],
        },
        {
            "companyId": cid,
            "name": "Tran Thi Bich",
            "skills": ["web", "network", "firewall"],
            "availableNow": True,
            "homeLocation": {"lat": 10.7769, "lng": 106.7009, "address": "HCMC"},
            "dMatrix": [
                {"typeCode": "WEB_DOWN",        "mode": "R", "durationHours": 1.0},
                {"typeCode": "WEB_DOWN",        "mode": "O", "durationHours": 2.0},
                {"typeCode": "ROUTING_OUT",     "mode": "O", "durationHours": 2.2},
                {"typeCode": "FIREWALL_BREACH", "mode": "R", "durationHours": 1.5},
                {"typeCode": "FIREWALL_BREACH", "mode": "O", "durationHours": 2.5},
            ],
        },
        {
            "companyId": cid,
            "name": "Le Van Cuong",
            "skills": ["server", "web", "database"],
            "availableNow": True,
            "homeLocation": {"lat": 21.0285, "lng": 105.8542, "address": "Ha Noi"},
            "dMatrix": [
                {"typeCode": "SERVER_NO_BOOT", "mode": "R", "durationHours": 2.0},
                {"typeCode": "SERVER_NO_BOOT", "mode": "O", "durationHours": 3.0},
                {"typeCode": "WEB_DOWN",       "mode": "R", "durationHours": 1.2},
                {"typeCode": "WEB_DOWN",       "mode": "O", "durationHours": 2.0},
                {"typeCode": "DB_CORRUPT",     "mode": "R", "durationHours": 2.5},
                {"typeCode": "DB_CORRUPT",     "mode": "O", "durationHours": 4.0},
            ],
        },
        {
            "companyId": cid,
            "name": "Pham Thi Dung",
            "skills": ["malware", "firewall", "database"],
            "availableNow": True,
            "homeLocation": {"lat": 16.0544, "lng": 108.2022, "address": "Da Nang"},
            "dMatrix": [
                {"typeCode": "MALWARE_SPREAD",  "mode": "R", "durationHours": 2.5},
                {"typeCode": "MALWARE_SPREAD",  "mode": "O", "durationHours": 4.0},
                {"typeCode": "FIREWALL_BREACH", "mode": "R", "durationHours": 1.5},
                {"typeCode": "FIREWALL_BREACH", "mode": "O", "durationHours": 2.5},
                {"typeCode": "DB_CORRUPT",      "mode": "R", "durationHours": 2.0},
                {"typeCode": "DB_CORRUPT",      "mode": "O", "durationHours": 3.5},
            ],
        },
        {
            "companyId": cid,
            "name": "Hoang Van Em",
            "skills": ["network", "server"],
            "availableNow": False,
            "homeLocation": {"lat": 10.0452, "lng": 105.7469, "address": "Can Tho"},
            "dMatrix": [
                {"typeCode": "ROUTING_OUT",    "mode": "O", "durationHours": 2.0},
                {"typeCode": "SERVER_NO_BOOT", "mode": "R", "durationHours": 3.0},
                {"typeCode": "SERVER_NO_BOOT", "mode": "O", "durationHours": 4.0},
                {"typeCode": "POWER_FAIL",     "mode": "O", "durationHours": 1.0},
            ],
        },
    ]
    await db.technicians.insert_many(technicians_data)

    # ------------------------------------------------------------------ components
    now = datetime.now(timezone.utc)
    components_data = [
        # Unit A (support station) - 3 bien che
        {
            "companyId": cid, "unitId": u[0],
            "name": "Server A-Primary", "type": "SERVER", "status": "ACTIVE",
            "location": "Rack A1 - Slot 1", "serial": "SRV-A-001",
            "ipAddress": "10.0.1.10", "macAddress": "00:1A:2B:3C:4D:01",
            "vendor": "Dell", "model": "PowerEdge R740",
            "os": "Ubuntu 22.04 LTS", "cpu": "Intel Xeon Silver 4216", "ramGB": 64, "storageGB": 2000,
            "firmware": "2.10.1",
            "networkConfig": {"subnet": "10.0.1.0/24", "gateway": "10.0.1.1", "vlan": "10"},
            "notes": "May chu chinh cho dich vu web",
        },
        {
            "companyId": cid, "unitId": u[0],
            "name": "Switch A-Core", "type": "SWITCH", "status": "ACTIVE",
            "location": "Network Closet A", "serial": "SW-A-001",
            "ipAddress": "10.0.1.2", "macAddress": "00:1A:2B:3C:4D:02",
            "vendor": "Cisco", "model": "Catalyst 9300",
            "firmware": "17.6.3",
            "networkConfig": {"subnet": "10.0.1.0/24", "gateway": "10.0.1.1", "vlan": "10"},
            "notes": "Switch trung tam don vi A",
        },
        {
            "companyId": cid, "unitId": u[0],
            "name": "Firewall A-FW01", "type": "FIREWALL", "status": "ACTIVE",
            "location": "Rack A1 - Slot 2", "serial": "FW-A-001",
            "ipAddress": "10.0.1.1", "macAddress": "00:1A:2B:3C:4D:03",
            "vendor": "Fortinet", "model": "FortiGate 100F",
            "firmware": "7.2.4",
            "networkConfig": {"subnet": "10.0.1.0/24", "gateway": "10.0.1.1", "vlan": "10"},
            "notes": "Tuong lua bien don vi A",
        },
        # Unit B (Ha Noi) - 4 bien che
        {
            "companyId": cid, "unitId": u[1],
            "name": "Server B-DB", "type": "SERVER", "status": "ACTIVE",
            "location": "Rack B2", "serial": "SRV-B-001",
            "ipAddress": "10.0.2.10", "macAddress": "00:1A:2B:3C:4D:10",
            "vendor": "HPE", "model": "ProLiant DL380 Gen10",
            "os": "Windows Server 2022", "cpu": "Intel Xeon Gold 5218", "ramGB": 128, "storageGB": 4000,
            "firmware": "3.2.0",
            "networkConfig": {"subnet": "10.0.2.0/24", "gateway": "10.0.2.1", "vlan": "20"},
            "notes": "May chu co so du lieu chinh",
        },
        {
            "companyId": cid, "unitId": u[1],
            "name": "Server B-Web", "type": "SERVER", "status": "ACTIVE",
            "location": "Rack B3", "serial": "SRV-B-002",
            "ipAddress": "10.0.2.11", "macAddress": "00:1A:2B:3C:4D:11",
            "vendor": "HPE", "model": "ProLiant DL360 Gen10",
            "os": "CentOS 7", "cpu": "Intel Xeon Silver 4208", "ramGB": 32, "storageGB": 1000,
            "firmware": "2.8.0",
            "networkConfig": {"subnet": "10.0.2.0/24", "gateway": "10.0.2.1", "vlan": "20"},
            "notes": "May chu web ung dung noi bo",
        },
        {
            "companyId": cid, "unitId": u[1],
            "name": "Router B-Edge", "type": "ROUTER", "status": "ACTIVE",
            "location": "ISP Room B", "serial": "RTR-B-001",
            "ipAddress": "10.0.2.1", "macAddress": "00:1A:2B:3C:4D:12",
            "vendor": "Juniper", "model": "MX204",
            "firmware": "21.2R1",
            "networkConfig": {"subnet": "10.0.2.0/24", "gateway": "10.0.2.1", "vlan": "20"},
            "notes": "Router bien don vi B",
        },
        {
            "companyId": cid, "unitId": u[1],
            "name": "NAS B-Storage", "type": "NAS", "status": "MAINTENANCE",
            "location": "Rack B4", "serial": "NAS-B-001",
            "ipAddress": "10.0.2.20", "macAddress": "00:1A:2B:3C:4D:13",
            "vendor": "Synology", "model": "RS3621xs+",
            "firmware": "7.1.1",
            "storageGB": 40000,
            "networkConfig": {"subnet": "10.0.2.0/24", "gateway": "10.0.2.1", "vlan": "20"},
            "notes": "Luu tru backup - dang bao tri",
        },
        # Unit C (Da Nang) - 3 bien che
        {
            "companyId": cid, "unitId": u[2],
            "name": "PC C-WS01", "type": "WORKSTATION", "status": "ACTIVE",
            "location": "Phong lam viec C - Ban 01", "serial": "WS-C-001",
            "ipAddress": "10.0.3.20", "macAddress": "00:1A:2B:3C:4D:20",
            "vendor": "Lenovo", "model": "ThinkStation P350",
            "os": "Windows 11 Pro", "cpu": "Core i9-11900", "ramGB": 32, "storageGB": 1000,
            "notes": "May tram ky thuat vien 1",
        },
        {
            "companyId": cid, "unitId": u[2],
            "name": "Laptop C-LT01", "type": "LAPTOP", "status": "ACTIVE",
            "location": "Phong hop C", "serial": "LTP-C-001",
            "ipAddress": "10.0.3.21", "macAddress": "00:1A:2B:3C:4D:21",
            "vendor": "Dell", "model": "Latitude 5520",
            "os": "Windows 11 Pro", "cpu": "Core i7-1165G7", "ramGB": 16, "storageGB": 512,
            "notes": "Laptop di dong cua truong phong",
        },
        {
            "companyId": cid, "unitId": u[2],
            "name": "Switch C-Access", "type": "SWITCH", "status": "INACTIVE",
            "location": "Phong mang C", "serial": "SW-C-001",
            "ipAddress": "10.0.3.2", "macAddress": "00:1A:2B:3C:4D:22",
            "vendor": "HP", "model": "Aruba 2530",
            "firmware": "16.10.0013",
            "networkConfig": {"subnet": "10.0.3.0/24", "gateway": "10.0.3.1", "vlan": "30"},
            "notes": "Switch tang truy cap - dang hu",
        },
        # Unit D (Can Tho) - 2 bien che
        {
            "companyId": cid, "unitId": u[3],
            "name": "Server D-App", "type": "SERVER", "status": "ACTIVE",
            "location": "Rack D1", "serial": "SRV-D-001",
            "ipAddress": "10.0.4.10", "macAddress": "00:1A:2B:3C:4D:30",
            "vendor": "Dell", "model": "PowerEdge R440",
            "os": "Ubuntu 20.04 LTS", "cpu": "Intel Xeon Bronze 3204", "ramGB": 16, "storageGB": 500,
            "firmware": "1.8.0",
            "networkConfig": {"subnet": "10.0.4.0/24", "gateway": "10.0.4.1", "vlan": "40"},
            "notes": "May chu ung dung don vi D",
        },
        {
            "companyId": cid, "unitId": u[3],
            "name": "Camera D-IP01", "type": "IP_CAMERA", "status": "ACTIVE",
            "location": "Cong chinh", "serial": "CAM-D-001",
            "ipAddress": "10.0.4.50", "macAddress": "00:1A:2B:3C:4D:31",
            "vendor": "Hikvision", "model": "DS-2CD2347G2-LU",
            "firmware": "5.7.12",
            "networkConfig": {"subnet": "10.0.4.0/24", "gateway": "10.0.4.1", "vlan": "41"},
            "notes": "Camera giam sat cong chinh",
        },
        # Unit E (Hai Phong) - 2 bien che
        {
            "companyId": cid, "unitId": u[4],
            "name": "Server E-Main", "type": "SERVER", "status": "ACTIVE",
            "location": "Rack E1", "serial": "SRV-E-001",
            "ipAddress": "10.0.5.10", "macAddress": "00:1A:2B:3C:4D:40",
            "vendor": "Lenovo", "model": "ThinkSystem SR630",
            "os": "Red Hat 8", "cpu": "Intel Xeon Silver 4210", "ramGB": 32, "storageGB": 1200,
            "firmware": "2.50",
            "networkConfig": {"subnet": "10.0.5.0/24", "gateway": "10.0.5.1", "vlan": "50"},
            "notes": "May chu chinh don vi E",
        },
        {
            "companyId": cid, "unitId": u[4],
            "name": "UPS E-01", "type": "UPS", "status": "ACTIVE",
            "location": "Phong may chu E", "serial": "UPS-E-001",
            "vendor": "APC", "model": "Smart-UPS 3000",
            "firmware": "9.9",
            "notes": "Bo luu dien du phong",
        },
    ]
    comp_ids = (await db.components.insert_many(components_data)).inserted_ids
    c = [str(i) for i in comp_ids]

    # ------------------------------------------------------------------ incidents
    def make_incident(unit_idx, comp_idx, type_code, status="OPEN", hours_ago=0):
        t = itype_map[type_code]
        reported = now - timedelta(hours=hours_ago)
        inc = {
            "companyId": cid,
            "unitId": u[unit_idx],
            "componentId": c[comp_idx],
            "typeCode": type_code,
            "priority": t["defaultPriority"],
            "status": status,
            "reportedAt": reported,
            "modeFeas": {"R": t["defaultFeasRemote"], "O": t["defaultFeasOnsite"]},
            "setupRemote": t["defaultSetupRemote"],
            "requirements": t["requirements"],
        }
        if status == "RESOLVED":
            inc["resolvedAt"] = reported + timedelta(hours=2)
        return inc

    incidents_data = [
        # Don vi B - Ha Noi: 2 su co dang mo
        make_incident(1, 3, "SERVER_NO_BOOT", "OPEN",        1.5),
        make_incident(1, 5, "WEB_DOWN",       "OPEN",        0.5),
        # Don vi B - su co da xu ly
        make_incident(1, 4, "DB_CORRUPT",     "RESOLVED",    24.0),
        make_incident(1, 3, "MALWARE_SPREAD", "RESOLVED",    48.0),
        # Don vi C - Da Nang: 1 su co dang xu ly
        make_incident(2, 9, "ROUTING_OUT",    "IN_PROGRESS", 3.0),
        # Don vi C - su co da xu ly
        make_incident(2, 7, "POWER_FAIL",     "RESOLVED",    12.0),
        # Don vi D - Can Tho: 1 su co moi
        make_incident(3, 10, "FIREWALL_BREACH", "OPEN",      0.25),
        # Don vi E - Hai Phong: 1 su co
        make_incident(4, 12, "SERVER_NO_BOOT", "DISPATCHED", 2.0),
        # Don vi E - su co da xu ly
        make_incident(4, 12, "POWER_FAIL",    "RESOLVED",    72.0),
    ]
    await db.incidents.insert_many(incidents_data)

    client.close()
    print("=== Seed thanh cong ===")
    print(f"  Company : Acme Logistics ({cid})")
    print(f"  Units   : {len(units_data)} (1 tram ho tro + 4 don vi)")
    print(f"  Users   : admin@acme.local / admin123  |  unit1-5@acme.local / unit123")
    print(f"  Bien che: {len(components_data)} tren 5 don vi")
    print(f"  Su co   : {len(incidents_data)} (OPEN/IN_PROGRESS/DISPATCHED/RESOLVED)")
    print(f"  KT vien : {len(technicians_data)} | Cong cu: {len(tools_data)} | License: {len(licenses_data)}")


if __name__ == "__main__":
    asyncio.run(seed())
