// AuraPEQ Internationalization (i18n) System

export const translations: Record<string, Record<string, string>> = {
	en: {
		supported_dacs_list: "Supported DACs List 📋",
		compat_warn_title: "Browser Compatibility Warning",
		compat_warn_text: "WebHID is not supported by your current browser. To write settings directly to your Audiocular Aura DAC hardware, please use a desktop Chromium-based browser like Google Chrome, Microsoft Edge, Opera, or Brave. You can still test the interactive EQ visualizer and import/export presets in Demo Mode below.",
		connect_dac: "CONNECT DAC",
		disconnect_dac: "DISCONNECT",
		status_online: "ONLINE",
		status_offline: "OFFLINE",
		last_applied_eq_label: "Last Applied EQ to DAC:",
		flat_profile_default: "Flat Profile (Default)",
		flat_profile_neutral: "Flat Profile (Neutral)",
		preamp_title: "Pre-Amp Gain",
		preamp_savi_constraint: "Integer steps only (Savitech hardware constraint)",
		preamp_fine_supported: "Fine steps (0.1 dB precision supported)",
		preamp_connect_to_enable: "Connect DAC to enable controls",
		visualizer_title: "Real-Time PEQ Response Curve",
		visualizer_subtitle: "Drag the interactive handles to adjust frequency and gain in real-time.",
		btn_undo: "UNDO",
		btn_redo: "REDO",
		btn_compare: "COMPARE:",
		btn_shortcuts: "SHORTCUTS",
		bands_title: "EQ Bands Controller",
		bands_subtitle: "Adjust parametric values for each of the 10 DSP bands.",
		preset_utilities_title: "Preset Utilities",
		preset_utilities_subtitle: "Import or export preset profiles.",
		btn_reset_defaults: "RESET DEFAULTS",
		btn_reset_flat: "RESET TO FLAT",
		btn_import_preset: "IMPORT PRESET",
		btn_export_json: "EXPORT JSON",
		btn_export_text: "EXPORT TEXT",
		custom_profiles_title: "My Custom Profiles",
		custom_profiles_subtitle: "Save & load profiles from local memory.",
		input_profile_name_placeholder: "Profile name...",
		btn_save_profile: "SAVE",
		autoeq_title: "AutoEq Online Database",
		autoeq_subtitle: "Search and apply settings for thousands of headphones & IEMs.",
		input_search_placeholder: "Search headphone model... (e.g. Zero RED)",
		hardware_controls_title: "Hardware Memory Controls",
		hardware_controls_subtitle: "Apply settings in real-time or flash them permanently.",
		btn_sync_ram: "SYNC TO RAM (APPLY)",
		btn_send_device: "SEND TO DEVICE",
		btn_save_flash: "SAVE TO FLASH (PERMANENT)",
		device_utilities_title: "⚙️ Device Utility Controls",
		device_utilities_subtitle: "Configure advanced hardware-level DAC parameters, amplifier states, and microphone gain.",
		hardware_filter_mode: "Hardware Filter Mode",
		hardware_amp_mode: "Hardware Amp Mode (SGM8262 Bypass)",
		hardware_gain_mode: "Hardware Gain Mode (1Vrms vs 2Vrms)",
		channel_balance: "Channel Balance",
		mic_monitor: "Microphone Loopback Monitor",
		mic_gain: "Microphone Gain",
		btn_factory_reset: "FACTORY RESET DAC",
		console_title: "System Messages Console",
		btn_copy_log: "COPY MSG LOG",
		modal_supported_dacs_title: "📋 Supported Hardware DSP DACs",
		modal_supported_dacs_desc: "The following hardware DSP audio controllers have been identified as compatible with WebHID PEQ configuration:",
		modal_report_device_title: "📢 Report Unknown Device",
		modal_report_device_desc: "Thank you for helping us add support for more devices! Confirm the details below to generate a report:",
		modal_shortcuts_title: "⌨️ Keyboard Shortcuts",
		modal_shortcuts_desc: "Use the following keyboard shortcuts to control AuraPEQ without a mouse:",
		shortcut_header_action: "Action",
		shortcut_header_key: "Shortcut",
		shortcut_undo: "Undo Last Adjustment",
		shortcut_redo: "Redo Last Adjustment",
		shortcut_ab: "A/B Compare Toggle",
		shortcut_reset_selected: "Reset Focused Band",
		shortcut_reset_all: "Reset All Bands to Default",
		shortcut_sync: "Sync settings to RAM",
		shortcut_flash: "Save settings to Flash",
		shortcut_prev_preset: "Load Previous Custom Profile",
		shortcut_next_preset: "Load Next Custom Profile",
		shortcut_toggle_band: "Toggle Focused Band Enable",
		shortcut_close: "Close Modal",
		
		// EQ band text
		band: "BAND",
		band_gain: "Gain (dB)",
		band_freq: "Freq (Hz)",
		band_q: "Q Factor",
		band_type: "Type",
		band_type_peak: "Peak",
		band_type_low: "Low Shelf",
		band_type_high: "High Shelf",
		
		// System console messages
		log_connected: "[System] Connected",
		log_disconnected: "Disconnected.",
		log_factory_reset_sent: "[System] Hardware factory reset command sent.",
		log_defaults_applied: "Defaults applied and synced.",
		log_flat_applied: "Flat neutral profile applied and synced.",
		log_sync_complete: "Sync Complete.",
		log_flash_write_success: "Flash Memory Write Successful.",
		support_project: "Support AuraPEQ:",
		upi_modal_desc: "If you are based in India, you can support AuraPEQ directly via UPI with zero processing fees.",
		upi_id_label: "UPI ID",
		upi_disclaimer: "Thank you so much! Every contribution directly supports new feature additions and hardware integrations."
	},
	es: {
		supported_dacs_list: "Lista de DACs compatibles 📋",
		compat_warn_title: "Advertencia de compatibilidad del navegador",
		compat_warn_text: "Su navegador actual no es compatible con WebHID. Para escribir la configuración directamente en el hardware de su DAC Audiocular Aura, utilice un navegador de escritorio basado en Chromium como Google Chrome, Microsoft Edge, Opera o Brave. Aún puede probar el visualizador de ecualizador interactivo e importar/exportar ajustes preestablecidos en el modo de demostración a continuación.",
		connect_dac: "CONECTAR DAC",
		disconnect_dac: "DESCONECTAR",
		status_online: "EN LÍNEA",
		status_offline: "DESCONECTADO",
		last_applied_eq_label: "Último ecualizador aplicado al DAC:",
		flat_profile_default: "Perfil plano (Predeterminado)",
		flat_profile_neutral: "Perfil plano (Neutro)",
		preamp_title: "Ganancia de preamplificación",
		preamp_savi_constraint: "Solo pasos enteros (restricción de hardware Savitech)",
		preamp_fine_supported: "Pasos finos (se admite precisión de 0.1 dB)",
		preamp_connect_to_enable: "Conecte el DAC para habilitar los controles",
		visualizer_title: "Curva de respuesta de PEQ en tiempo real",
		visualizer_subtitle: "Arrastre los manejadores interactivos para ajustar la frecuencia y la ganancia en tiempo real.",
		btn_undo: "DESHACER",
		btn_redo: "REHACER",
		btn_compare: "COMPARAR:",
		btn_shortcuts: "ATAJOS",
		bands_title: "Controlador de bandas de ecualización",
		bands_subtitle: "Ajuste los valores paramétricos para cada una de las 10 bandas DSP.",
		preset_utilities_title: "Utilidades de preajustes",
		preset_utilities_subtitle: "Importar o exportar perfiles preestablecidos.",
		btn_reset_defaults: "RESTABLECER PREDETERMINADOS",
		btn_reset_flat: "RESTABLECER A PLANO",
		btn_import_preset: "IMPORTAR PREAJUSTE",
		btn_export_json: "EXPORTAR JSON",
		btn_export_text: "EXPORTAR TEXTO",
		custom_profiles_title: "Mis perfiles personalizados",
		custom_profiles_subtitle: "Guardar y cargar perfiles desde la memoria local.",
		input_profile_name_placeholder: "Nombre del perfil...",
		btn_save_profile: "GUARDAR",
		autoeq_title: "Base de datos en línea AutoEq",
		autoeq_subtitle: "Busque y aplique configuraciones para miles de auriculares e IEM.",
		input_search_placeholder: "Buscar modelo de auricular... (ej. Zero RED)",
		hardware_controls_title: "Controles de memoria de hardware",
		hardware_controls_subtitle: "Aplique configuraciones en tiempo real o grábelas permanentemente.",
		btn_sync_ram: "SINCRONIZAR A RAM (APLICAR)",
		btn_send_device: "ENVIAR AL DISPOSITIVO",
		btn_save_flash: "GUARDAR EN FLASH (PERMANENTE)",
		device_utilities_title: "⚙️ Controles de utilidad del dispositivo",
		device_utilities_subtitle: "Configure parámetros avanzados del DAC a nivel de hardware, estados del amplificador y ganancia del micrófono.",
		hardware_filter_mode: "Modo de filtro de hardware",
		hardware_amp_mode: "Modo de amplificador de hardware (bypass SGM8262)",
		hardware_gain_mode: "Modo de ganancia de hardware (1Vrms vs 2Vrms)",
		channel_balance: "Balance de canales",
		mic_monitor: "Monitor de bucle de micrófono",
		mic_gain: "Ganancia de micrófono",
		btn_factory_reset: "RESTABLECIMIENTO DE FÁBRICA DEL DAC",
		console_title: "Consola de mensajes del sistema",
		btn_copy_log: "COPIAR REGISTRO DE MENSAJES",
		modal_supported_dacs_title: "📋 DACs DSP compatibles",
		modal_supported_dacs_desc: "Se ha identificado que los siguientes controladores de audio DSP son compatibles con la configuración WebHID PEQ:",
		modal_report_device_title: "📢 Reportar dispositivo desconocido",
		modal_report_device_desc: "¡Gracias por ayudarnos a agregar soporte para más dispositivos! Confirme los detalles a continuación para generar un informe:",
		modal_shortcuts_title: "⌨️ Atajos de teclado",
		modal_shortcuts_desc: "Use los siguientes atajos de teclado para controlar AuraPEQ sin un mouse:",
		shortcut_header_action: "Acción",
		shortcut_header_key: "Atajo",
		shortcut_undo: "Deshacer último ajuste",
		shortcut_redo: "Rehacer último ajuste",
		shortcut_ab: "Alternar comparación A/B",
		shortcut_reset_selected: "Restablecer banda enfocada",
		shortcut_reset_all: "Restablecer todas las bandas",
		shortcut_sync: "Sincronizar a RAM",
		shortcut_flash: "Guardar en flash",
		shortcut_prev_preset: "Cargar perfil personalizado anterior",
		shortcut_next_preset: "Cargar siguiente perfil personalizado",
		shortcut_toggle_band: "Alternar activación de banda enfocada",
		shortcut_close: "Cerrar ventana",
		
		band: "BANDA",
		band_gain: "Ganancia (dB)",
		band_freq: "Frec (Hz)",
		band_q: "Factor Q",
		band_type: "Tipo",
		band_type_peak: "Pico",
		band_type_low: "Low Shelf",
		band_type_high: "High Shelf",
		
		log_connected: "[Sistema] Conectado",
		log_disconnected: "Desconectado.",
		log_factory_reset_sent: "[Sistema] Comando de restablecimiento de fábrica enviado.",
		log_defaults_applied: "Valores predeterminados aplicados y sincronizados.",
		log_flat_applied: "Perfil plano neutral aplicado y sincronizado.",
		log_sync_complete: "Sincronización completada.",
		log_flash_write_success: "Escritura en memoria flash exitosa.",
		support_project: "Apoye a AuraPEQ:",
		upi_modal_desc: "Si se encuentra en la India, puede apoyar a AuraPEQ directamente a través de UPI con cero tarifas de procesamiento.",
		upi_id_label: "UPI ID",
		upi_disclaimer: "¡Muchas gracias! Cada contribución apoya directamente la adición de nuevas funciones e integraciones de hardware."
	},
	de: {
		supported_dacs_list: "Liste unterstützter DACs 📋",
		compat_warn_title: "Browser-Kompatibilitätswarnung",
		compat_warn_text: "WebHID wird von Ihrem aktuellen Browser nicht unterstützt. Um Einstellungen direkt in die Hardware Ihres Audiocular Aura DACs zu schreiben, verwenden Sie bitte einen Desktop-Chromium-basierten Browser wie Google Chrome, Microsoft Edge, Opera oder Brave. Sie können den interaktiven EQ-Visualisierer weiterhin testen und Voreinstellungen im untenstehenden Demo-Modus importieren/exportieren.",
		connect_dac: "DAC VERBINDEN",
		disconnect_dac: "TRENNEN",
		status_online: "ONLINE",
		status_offline: "OFFLINE",
		last_applied_eq_label: "Zuletzt angewendeter EQ am DAC:",
		flat_profile_default: "Flaches Profil (Standard)",
		flat_profile_neutral: "Flaches Profil (Neutral)",
		preamp_title: "Vorverstärkung (Pre-Amp)",
		preamp_savi_constraint: "Nur Ganzzahlschritte (Savitech Hardware-Einschränkung)",
		preamp_fine_supported: "Feine Schritte (0.1 dB Präzision unterstützt)",
		preamp_connect_to_enable: "DAC verbinden, um Steuerung zu aktivieren",
		visualizer_title: "Echtzeit-PEQ-Frequenzgangkurve",
		visualizer_subtitle: "Ziehen Sie die interaktiven Griffe, um Frequenz und Verstärkung in Echtzeit anzupassen.",
		btn_undo: "RÜCKGÄNGIG",
		btn_redo: "WIEDERHOLEN",
		btn_compare: "VERGLEICHEN:",
		btn_shortcuts: "TASTENBELEGUNG",
		bands_title: "EQ-Bänder-Steuerung",
		bands_subtitle: "Passen Sie die parametrischen Werte für jedes der 10 DSP-Bänder an.",
		preset_utilities_title: "Voreinstellungs-Dienstprogramme",
		preset_utilities_subtitle: "Voreinstellungsprofile importieren oder exportieren.",
		btn_reset_defaults: "STANDARD ZURÜCKSETZEN",
		btn_reset_flat: "AUF FLACH ZURÜCKSETZEN",
		btn_import_preset: "PRESET IMPORTIEREN",
		btn_export_json: "JSON EXPORTIEREN",
		btn_export_text: "TEXT EXPORTIEREN",
		custom_profiles_title: "Meine benutzerdefinierten Profile",
		custom_profiles_subtitle: "Profile im lokalen Speicher speichern & laden.",
		input_profile_name_placeholder: "Profilname...",
		btn_save_profile: "SPEICHERN",
		autoeq_title: "AutoEq Online-Datenbank",
		autoeq_subtitle: "Suchen und wenden Sie Einstellungen für Tausende von Kopfhörern und IEMs an.",
		input_search_placeholder: "Kopfhörermodell suchen... (z. B. Zero RED)",
		hardware_controls_title: "Hardware-Speichersteuerung",
		hardware_controls_subtitle: "Wenden Sie Einstellungen in Echtzeit an oder flashen Sie sie dauerhaft.",
		btn_sync_ram: "AUF RAM SYNCHRONISIEREN (ANWENDEN)",
		btn_send_device: "AN GERÄT SENDEN",
		btn_save_flash: "AUF FLASH SPEICHERN (PERMANENT)",
		device_utilities_title: "⚙️ Geräte-Utility-Steuerung",
		device_utilities_subtitle: "Konfigurieren Sie erweiterte DAC-Parameter auf Hardwareebene, Verstärkerzustände und Mikrofonverstärkung.",
		hardware_filter_mode: "Hardware-Filtermodus",
		hardware_amp_mode: "Hardware-Verstärkermodus (SGM8262-Bypass)",
		hardware_gain_mode: "Hardware-Verstärkungsmodus (1Vrms vs 2Vrms)",
		channel_balance: "Kanalbalance",
		mic_monitor: "Mikrofon-Schleifenmonitor",
		mic_gain: "Mikrofonverstärkung",
		btn_factory_reset: "DAC AUF WERKSEINSTELLUNG",
		console_title: "Systemmeldungskonsole",
		btn_copy_log: "PROTOKOLL KOPIEREN",
		modal_supported_dacs_title: "📋 Unterstützte Hardware-DSP-DACs",
		modal_supported_dacs_desc: "Die folgenden Hardware-DSP-Audiocontroller wurden als kompatibel mit der WebHID-PEQ-Konfiguration identifiziert:",
		modal_report_device_title: "📢 Unbekanntes Gerät melden",
		modal_report_device_desc: "Vielen Dank, dass Sie uns helfen, Unterstützung für weitere Geräte hinzuzufügen! Bestätigen Sie die Details unten, um einen Bericht zu erstellen:",
		modal_shortcuts_title: "⌨️ Tastaturkurzbefehle",
		modal_shortcuts_desc: "Verwenden Sie die folgenden Tastaturkurzbefehle, um AuraPEQ ohne Maus zu steuern:",
		shortcut_header_action: "Aktion",
		shortcut_header_key: "Tastenkombination",
		shortcut_undo: "Letzte Anpassung rückgängig machen",
		shortcut_redo: "Letzte Anpassung wiederholen",
		shortcut_ab: "A/B-Vergleich umschalten",
		shortcut_reset_selected: "Fokussiertes Band zurücksetzen",
		shortcut_reset_all: "Alle Bänder zurücksetzen",
		shortcut_sync: "Einstellungen im RAM synchronisieren",
		shortcut_flash: "Einstellungen im Flash speichern",
		shortcut_prev_preset: "Vorheriges benutzerdefiniertes Profil laden",
		shortcut_next_preset: "Nächstes benutzerdefiniertes Profil laden",
		shortcut_toggle_band: "Aktivierung des fokussierten Bandes umschalten",
		shortcut_close: "Fenster schließen",
		
		band: "BAND",
		band_gain: "Gain (dB)",
		band_freq: "Freq (Hz)",
		band_q: "Q-Faktor",
		band_type: "Typ",
		band_type_peak: "Peak",
		band_type_low: "Low Shelf",
		band_type_high: "High Shelf",
		
		log_connected: "[System] Verbunden",
		log_disconnected: "Verbindung getrennt.",
		log_factory_reset_sent: "[System] Werksreset-Befehl gesendet.",
		log_defaults_applied: "Standardwerte angewendet und synchronisiert.",
		log_flat_applied: "Flaches neutrales Profil angewendet und synchronisiert.",
		log_sync_complete: "Synchronisierung abgeschlossen.",
		log_flash_write_success: "Erfolgreich in den Flash-Speicher geschrieben.",
		support_project: "AuraPEQ unterstützen:",
		upi_modal_desc: "Wenn Sie in Indien ansässig sind, können Sie AuraPEQ direkt über UPI ohne Bearbeitungsgebühren unterstützen.",
		upi_id_label: "UPI-ID",
		upi_disclaimer: "Vielen Dank! Jeder Beitrag unterstützt direkt das Hinzufügen neuer Funktionen und Hardware-Integrationen."
	},
	zh: {
		supported_dacs_list: "支持的 DAC 列表 📋",
		compat_warn_title: "浏览器兼容性警告",
		compat_warn_text: "您的当前浏览器不支持 WebHID。要将设置直接写入您的 Audiocular Aura DAC 硬件，请使用 Chrome、Edge、Opera 或 Brave 等桌面 Chromium 浏览器。您仍可以在下方的演示模式中测试交互式均衡器和导入/导出预设。",
		connect_dac: "连接 DAC",
		disconnect_dac: "断开连接",
		status_online: "在线",
		status_offline: "离线",
		last_applied_eq_label: "最后应用到 DAC 的均衡器：",
		flat_profile_default: "平直曲线 (默认)",
		flat_profile_neutral: "平直曲线 (中性)",
		preamp_title: "前级增益 (Pre-Amp)",
		preamp_savi_constraint: "仅整数步进 (Savitech 硬件限制)",
		preamp_fine_supported: "细微步进 (支持 0.1 dB 精度)",
		preamp_connect_to_enable: "连接 DAC 以启用控制",
		visualizer_title: "实时 PEQ 响应曲线",
		visualizer_subtitle: "拖拽交互式手柄实时调整频率和增益。",
		btn_undo: "撤销",
		btn_redo: "重做",
		btn_compare: "对比:",
		btn_shortcuts: "快捷键",
		bands_title: "EQ 频段控制器",
		bands_subtitle: "调整 10 个 DSP 频段中每个频段的参量值。",
		preset_utilities_title: "预设工具",
		preset_utilities_subtitle: "导入或导出预设配置文件。",
		btn_reset_defaults: "恢复默认频段",
		btn_reset_flat: "重置为平直",
		btn_import_preset: "导入预设",
		btn_export_json: "导出 JSON",
		btn_export_text: "导出文本",
		custom_profiles_title: "我的自定义配置",
		custom_profiles_subtitle: "从本地内存保存和加载配置文件。",
		input_profile_name_placeholder: "配置文件名称...",
		btn_save_profile: "保存",
		autoeq_title: "AutoEq 在线数据库",
		autoeq_subtitle: "搜索并应用数千种耳机和耳塞的设置。",
		input_search_placeholder: "搜索耳机型号... (例如 Zero RED)",
		hardware_controls_title: "硬件存储控制",
		hardware_controls_subtitle: "实时应用设置或将其永久烧录。",
		btn_sync_ram: "同步到内存 (RAM)",
		btn_send_device: "发送到设备",
		btn_save_flash: "保存到闪存 (Flash)",
		device_utilities_title: "⚙️ 设备实用控制",
		device_utilities_subtitle: "配置高级硬件级 DAC 参数、放大器状态和麦克风增益。",
		hardware_filter_mode: "硬件滤波器模式",
		hardware_amp_mode: "硬件放大器模式 (SGM8262 旁路)",
		hardware_gain_mode: "硬件增益模式 (1Vrms vs 2Vrms)",
		channel_balance: "声道平衡",
		mic_monitor: "麦克风旁路监听",
		mic_gain: "麦克风增益",
		btn_factory_reset: "恢复 DAC 出厂设置",
		console_title: "系统消息控制台",
		btn_copy_log: "复制日志",
		modal_supported_dacs_title: "📋 支持的硬件 DSP DAC",
		modal_supported_dacs_desc: "以下硬件 DSP 音频控制器已被确认为兼容 WebHID PEQ 配置：",
		modal_report_device_title: "📢 报告未知设备",
		modal_report_device_desc: "感谢您帮助我们添加对更多设备的支持！确认以下详细信息以生成报告：",
		modal_shortcuts_title: "⌨️ 键盘快捷键",
		modal_shortcuts_desc: "使用以下键盘快捷键在不使用鼠标的情况下控制 AuraPEQ：",
		shortcut_header_action: "操作",
		shortcut_header_key: "快捷键",
		shortcut_undo: "撤销上次调整",
		shortcut_redo: "重做上次调整",
		shortcut_ab: "A/B 对比切换",
		shortcut_reset_selected: "重置选中频段",
		shortcut_reset_all: "重置所有频段",
		shortcut_sync: "同步设置到内存 (RAM)",
		shortcut_flash: "保存设置到闪存 (Flash)",
		shortcut_prev_preset: "加载上一个自定义配置文件",
		shortcut_next_preset: "加载下一个自定义配置文件",
		shortcut_toggle_band: "切换选中频段的启用状态",
		shortcut_close: "关闭窗口",
		
		band: "频段",
		band_gain: "增益 (dB)",
		band_freq: "频率 (Hz)",
		band_q: "Q 值 (带宽)",
		band_type: "类型",
		band_type_peak: "峰值 Peak",
		band_type_low: "低架 Low Shelf",
		band_type_high: "高架 High Shelf",
		
		log_connected: "[系统] 已连接",
		log_disconnected: "断开连接。",
		log_factory_reset_sent: "[系统] 硬件出厂重置指令已发送。",
		log_defaults_applied: "默认值已应用并同步。",
		log_flat_applied: "平直中性配置已应用并同步。",
		log_sync_complete: "同步完成。",
		log_flash_write_success: "闪存写入成功。",
		support_project: "支持 AuraPEQ:",
		upi_modal_desc: "如果您在印度，可以通过 UPI 直接支持 AuraPEQ，无需任何手续费。",
		upi_id_label: "UPI 账号",
		upi_disclaimer: "非常感谢！您的每一份捐赠都直接支持新功能的开发与硬件适配。"
	}
};

let currentLang = localStorage.getItem("aura_lang") || detectBrowserLanguage() || "en";

function detectBrowserLanguage(): string {
	if (typeof navigator !== "undefined" && navigator.language) {
		const prefix = navigator.language.split("-")[0].toLowerCase();
		if (translations[prefix]) return prefix;
	}
	return "en";
}

export function getCurrentLang(): string {
	return currentLang;
}

export function setCurrentLang(lang: string) {
	if (translations[lang]) {
		currentLang = lang;
		localStorage.setItem("aura_lang", lang);
	}
}

export function t(key: string): string {
	const langDict = translations[currentLang] || translations["en"];
	return langDict[key] || translations["en"][key] || key;
}

export function applyTranslations() {
	// 1. Textcontent
	document.querySelectorAll("[data-i18n]").forEach((el) => {
		const key = el.getAttribute("data-i18n");
		if (key) {
			const translation = t(key);
			// Safely set text content without clearing nested HTML icon tags if present
			const iconSpan = el.querySelector(".icon");
			if (iconSpan) {
				// Keep icon and replace text
				const textNode = Array.from(el.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
				if (textNode) {
					textNode.textContent = " " + translation;
				} else {
					el.innerHTML = `${iconSpan.outerHTML} ${translation}`;
				}
			} else {
				el.textContent = translation;
			}
		}
	});

	// 2. Input Placeholder
	document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
		const key = el.getAttribute("data-i18n-placeholder");
		if (key && el.tagName === "INPUT") {
			(el as HTMLInputElement).placeholder = t(key);
		}
	});

	// 3. Aria Label
	document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
		const key = el.getAttribute("data-i18n-aria");
		if (key) {
			el.setAttribute("aria-label", t(key));
		}
	});

	// 4. Title attribute
	document.querySelectorAll("[data-i18n-title]").forEach((el) => {
		const key = el.getAttribute("data-i18n-title");
		if (key) {
			(el as HTMLElement).title = t(key);
		}
	});
}

// Expose lookup globally for dynamic rendering contexts
(window as any).t = t;
