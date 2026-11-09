/*
 * ObsMéd — Application locale de rédaction d'observations médicales
 * Fonctionne sans serveur ni compte. Données enregistrées dans IndexedDB du navigateur.
 * Un PDF importé est conservé comme pièce jointe ; il n'est pas converti automatiquement
 * en formulaire éditable. Pour transférer une observation éditable, utiliser la sauvegarde JSON.
 */

'use strict';

const DB_NAME = 'obsmed_database';
const DB_VERSION = 1;
const STORE_NAME = 'observations';
const OTHER_VALUE = '__other__';
const MAX_PDF_SIZE = 25 * 1024 * 1024;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const field = {
  text: (name, label, extra = {}) => ({ type: 'text', name, label, ...extra }),
  number: (name, label, unit = '', extra = {}) => ({ type: 'number', name, label, unit, ...extra }),
  date: (name, label, extra = {}) => ({ type: 'date', name, label, ...extra }),
  textarea: (name, label, extra = {}) => ({ type: 'textarea', name, label, ...extra }),
  radio: (name, label, options, extra = {}) => ({ type: 'radio', name, label, options, ...extra }),
  checks: (name, label, options, extra = {}) => ({ type: 'checks', name, label, options, ...extra }),
  select: (name, label, options, extra = {}) => ({ type: 'select', name, label, options, ...extra }),
  computed: (name, label, extra = {}) => ({ type: 'computed', name, label, ...extra })
};

const schema = [
  {
    id: 'identite', number: '01', title: 'Interrogatoire · Identité et motif', subtitle: 'Identification du patient et plainte initiale', groups: [
      { title: 'Identification du patient', fields: [
        field.date('date_observation', "Date de l'observation", { defaultValue: todayISO() }),
        field.text('clinicien', 'Nom du clinicien / étudiant'),
        field.text('patient_nom', 'Nom et prénom du patient'),
        field.number('patient_age', 'Âge', 'ans'),
        field.date('patient_naissance', 'Date de naissance'),
        field.radio('patient_sexe', 'Sexe', ['Masculin', 'Féminin']),
        field.radio('patient_familial', 'Statut familial', ['Célibataire', 'Marié(e)', 'Divorcé(e)', 'Veuf / Veuve']),
        field.text('patient_parite', 'Parité (si femme)', { placeholder: 'G… P…' }),
        field.text('patient_profession', 'Profession'),
        field.checks('profession_exposition', 'Contexte professionnel', ['Sédentaire', 'Exposition toxique', 'Stress']),
        field.radio('patient_assurance', 'Mutualiste / assurance', ['Oui', 'Non']),
        field.text('patient_assurance_type', 'Type de couverture sociale'),
        field.text('patient_origine', 'Origine / ville de naissance'),
        field.text('patient_residence', 'Lieu de résidence'),
        field.text('patient_medecin', 'Médecin traitant'),
        field.text('patient_contact', 'Téléphone / personne à contacter')
      ]},
      { title: 'Motif de consultation ou d’hospitalisation', hint: 'Le motif doit être un symptôme ou une plainte, jamais un diagnostic.', fields: [
        field.checks('motif_symptomes', 'Symptôme(s) principal(aux)', ['Céphalées', 'Douleur thoracique', 'Dyspnée', 'Douleur abdominale', 'Fièvre', 'Hématurie', 'Métrorragies']),
        field.text('motif_autre', 'Autre motif / précision'),
        field.number('motif_duree', 'Durée d’évolution', '', { placeholder: 'Ex. 3' }),
        field.select('motif_unite', 'Unité', ['Heures', 'Jours', 'Semaines', 'Mois', 'Années']),
        field.radio('motif_debut', 'Mode de début', ['Brutal', 'Progressif']),
        field.radio('motif_retentissement', 'Retentissement', ['Léger', 'Modéré', 'Sévère']),
        field.textarea('motif_precision', 'Précisions sur la plainte')
      ]}
    ]
  },
  {
    id: 'antecedents', number: '02', title: 'Interrogatoire · Antécédents et mode de vie', subtitle: 'ATCD personnels, familiaux, traitements et facteurs de risque', groups: [
      { title: 'Antécédents personnels médicaux', fields: [
        field.checks('atcd_tares', 'Tares / maladies chroniques', ['HTA', 'Diabète de type 1', 'Diabète de type 2', 'Asthme', 'BPCO', 'Cardiopathie', 'Néphropathie', 'Hépatopathie', 'Dyslipidémie', 'Épilepsie', 'Maladie neurologique', 'Maladie rhumatologique', 'Cancer', 'Maladie auto-immune']),
        field.checks('atcd_infectieux', 'Antécédents infectieux', ['Contage tuberculeux', 'Tuberculose', 'Hépatite virale', 'IST', 'Infection VIH connue', 'Autre infection']),
        field.radio('atcd_hospitalisation', 'Hospitalisation antérieure', ['Oui', 'Non']),
        field.textarea('atcd_hospitalisation_details', 'Motif, date, lieu et durée des hospitalisations', { full: true }),
        field.textarea('atcd_medicaux_details', 'Autres antécédents médicaux / détails des maladies', { full: true }),
        field.textarea('atcd_traumatiques', 'Antécédents traumatiques (type, date, séquelles)', { full: true }),
        field.textarea('atcd_transfusion', 'Transfusions antérieures (date, indication, incidents)', { full: true }),
        field.textarea('traitements_cours', 'Traitements habituels et automédication (nom, dose, fréquence)', { full: true })
      ]},
      { title: 'Antécédents chirurgicaux', fields: [
        field.radio('atcd_chirurgie', 'Déjà opéré(e)', ['Oui', 'Non']),
        field.textarea('atcd_chirurgie_details', 'Type d’intervention, date, lieu, compte rendu et complications (transfusion, phlébite, infection…)', { full: true })
      ]},
      { title: 'Antécédents gynéco-obstétricaux (si pertinent)', fields: [
        field.number('gyne_menarche', 'Âge de la ménarche', 'ans'),
        field.radio('gyne_cycles', 'Cycles menstruels', ['Réguliers', 'Irréguliers', 'Aménorrhée']),
        field.text('gyne_duree_cycle', 'Durée / intervalle des cycles'),
        field.text('gyne_abondance', 'Abondance et durée des règles'),
        field.date('gyne_ddr', 'Date des dernières règles (DDR)'),
        field.radio('gyne_contraception', 'Contraception', ['Oui', 'Non']),
        field.text('gyne_contraception_type', 'Type, durée et tolérance de la contraception'),
        field.text('gyne_gestite', 'Gestité (G)'),
        field.text('gyne_parite', 'Parité (P)'),
        field.number('gyne_fausse_couche', 'Nombre de fausses couches / GEU'),
        field.checks('gyne_accouchements', 'Modalités des accouchements', ['Voie basse', 'Césarienne', 'Instrumental']),
        field.textarea('gyne_grossesses_details', 'Déroulement des grossesses, complications, terme, poids de naissance, enfants vivants', { full: true }),
        field.radio('gyne_menopause', 'Ménopause', ['Oui', 'Non']),
        field.text('gyne_menopause_age', 'Âge / date de la ménopause')
      ]},
      { title: 'Antécédents allergiques', fields: [
        field.checks('allergies', 'Allergies connues', ['Médicamenteuse', 'Alimentaire', 'Produit de contraste iodé', 'Latex', 'Atopie / eczéma', 'Rhinite allergique', 'Asthme allergique', 'Aucune allergie connue']),
        field.textarea('allergies_details', 'Préciser la substance, le type de réaction, la date et la gravité', { full: true })
      ]},
      { title: 'Antécédents familiaux', fields: [
        field.checks('atcd_familiaux', 'Tares familiales', ['Cas similaires', 'HTA', 'Diabète', 'Cancer', 'Cardiopathie', 'Maladie thromboembolique', 'Maladie génétique', 'Maladie psychiatrique', 'Consanguinité']),
        field.textarea('atcd_familiaux_details', 'Préciser le lien de parenté, la maladie, l’âge de survenue et la cause des décès éventuels', { full: true })
      ]},
      { title: 'Habitudes de vie et facteurs de risque', fields: [
        field.radio('tabac_statut', 'Tabagisme', ['Actif', 'Passif', 'Sevré', 'Jamais']),
        field.number('tabac_pa', 'Paquets-années (PA)'),
        field.text('tabac_details', 'Durée, quantité, date du sevrage'),
        field.radio('alcool', 'Consommation d’alcool', ['Oui', 'Non']),
        field.text('alcool_quantite', 'Quantité / fréquence (verres par jour ou semaine)'),
        field.checks('autres_toxiques', 'Autres consommations / expositions', ['Cannabis', 'Drogues dures', 'Médicaments psychoactifs', 'Phytothérapie', 'Exposition professionnelle']),
        field.radio('activite_physique', 'Activité physique', ['Sédentaire', 'Active', 'Sportive']),
        field.textarea('mode_vie', 'Alimentation, logement, entourage, loisirs, animaux, voyages, conditions socio-économiques', { full: true }),
        field.textarea('vaccinations_ist', 'Vaccinations, statut IST / dépistages si pertinents', { full: true })
      ]}
    ]
  },
  {
    id: 'hdm', number: '03', title: 'Interrogatoire · Histoire de la maladie', subtitle: 'Chronologie et caractérisation des symptômes', groups: [
      { title: 'Description chronologique', hint: 'Décrire les faits dans l’ordre, sans interprétation diagnostique.', fields: [
        field.text('hdm_debut_date', 'Date / ancienneté du début'),
        field.radio('hdm_mode', 'Mode de début', ['Brutal', 'Progressif', 'Insidieux']),
        field.text('hdm_localisation', 'Localisation'),
        field.text('hdm_qualite', 'Qualité / type du symptôme'),
        field.text('hdm_rythme', 'Rythme, durée et fréquence'),
        field.number('hdm_intensite', 'Intensité (échelle 0 à 10)', '/10', { min: 0, max: 10 }),
        field.text('hdm_facteurs_aggravants', 'Facteurs aggravants'),
        field.text('hdm_facteurs_soulageants', 'Facteurs calmants / soulageants'),
        field.textarea('hdm_associes', 'Manifestations / signes associés', { full: true }),
        field.textarea('hdm_chronologie', 'Chronologie détaillée et évolution depuis le début', { full: true }),
        field.radio('hdm_evolution', 'Évolution globale', ['Amélioration', 'Aggravation', 'Stable', 'Fluctuante']),
        field.radio('hdm_traitement', 'Traitements déjà reçus', ['Oui', 'Non']),
        field.textarea('hdm_traitement_details', 'Traitements reçus, doses si connues, durée et efficacité', { full: true }),
        field.textarea('hdm_signes_negatifs', 'Signes négatifs pertinents (éléments recherchés et absents)', { full: true }),
        field.checks('hdm_aeg', 'Retentissement sur l’état général (3 A)', ['Asthénie', 'Anorexie', 'Amaigrissement']),
        field.text('hdm_poids_perdu', 'Perte de poids chiffrée / durée'),
        field.textarea('hdm_contexte', 'Contexte associé (infectieux, hémorragique, tumoral, traumatique, autre)', { full: true })
      ]}
    ]
  },
  {
    id: 'general', number: '04', title: 'Examen clinique général', subtitle: 'Constantes, Glasgow, état général et inspection', groups: [
      { title: 'Constantes et mensurations', fields: [
        field.number('poids', 'Poids', 'kg', { step: '0.1' }),
        field.number('taille', 'Taille', 'm', { step: '0.01', placeholder: 'Ex. 1.72' }),
        field.computed('imc_calcule', 'IMC calculé', { helper: 'Poids (kg) ÷ taille² (m²)' }),
        field.number('tour_taille', 'Tour de taille', 'cm'),
        field.number('temperature', 'Température', '°C', { step: '0.1' }),
        field.number('fc', 'Fréquence cardiaque', 'bpm'),
        field.number('fr', 'Fréquence respiratoire', 'cycles/min'),
        field.number('ta_systolique', 'TA systolique', 'mmHg'),
        field.number('ta_diastolique', 'TA diastolique', 'mmHg'),
        field.number('spo2', 'Saturation SpO₂', '%'),
        field.number('glycemie', 'Glycémie capillaire', 'g/L', { step: '0.01' }),
        field.text('bu', 'Bandelette urinaire (BU)')
      ]},
      { title: 'Score de Glasgow (GCS)', hint: 'Sélectionner une réponse par composante ; le total est calculé.', fields: [
        field.radio('gcs_yeux', 'Ouverture des yeux (Y)', ['4 · Spontanée', '3 · À la voix / demande', '2 · À la douleur', '1 · Aucune']),
        field.radio('gcs_verbal', 'Réponse verbale (V)', ['5 · Orientée', '4 · Confuse', '3 · Inappropriée', '2 · Incompréhensible', '1 · Aucune']),
        field.radio('gcs_moteur', 'Réponse motrice (M)', ['6 · Obéit aux ordres', '5 · Localise la douleur', '4 · Évitement', '3 · Flexion', '2 · Extension', '1 · Aucune']),
        field.computed('gcs_total', 'Score total de Glasgow', { helper: 'Somme Y + V + M / 15' })
      ]},
      { title: 'État général et inspection', fields: [
        field.radio('conscience', 'État de conscience', ['Éveillé', 'Somnolent', 'Confus', 'Comateux']),
        field.radio('coloration', 'Coloration', ['Normale', 'Pâleur', 'Ictère', 'Cyanose', 'Marbrures']),
        field.radio('hydratation', 'État d’hydratation', ['Normal', 'Déshydratation', 'Œdèmes']),
        field.radio('hygiene', 'Hygiène', ['Bonne', 'Négligée']),
        field.radio('attitude', 'Attitude / aspect', ['Normal', 'Prostré', 'Agité', 'Triste']),
        field.radio('autonomie', 'Autonomie', ['Indépendant', 'Aide partielle', 'Grabataire']),
        field.textarea('general_details', 'Autres éléments de l’examen général', { full: true })
      ]},
      { title: 'Examen cutanéo-muqueux', fields: [
        field.checks('peau_signes', 'Peau', ['Normale', 'Pâleur', 'Ictère', 'Cyanose', 'Érythème', 'Purpura', 'Pétéchies', 'Vésicules', 'Bulles', 'Pustules', 'Ulcérations', 'Cicatrices', 'Vergetures', 'Marbrures']),
        field.checks('muqueuses_signes', 'Muqueuses', ['Normales', 'Pâles', 'Ictériques', 'Ulcérations', 'Candidose', 'Gingivorragies']),
        field.checks('phaneres_signes', 'Phanères', ['Ongles normaux', 'Déformations unguéales', 'Alopécie', 'Chute des cheveux', 'Hippocratisme digital']),
        field.textarea('cutaneo_details', 'Description : siège, taille, couleur, relief, limites, extension, évolution', { full: true })
      ]},
      { title: 'Aires ganglionnaires et thyroïde', fields: [
        field.checks('ganglions_aires', 'Aires examinées', ['Cervicales', 'Sus-claviculaires', 'Axillaires', 'Épitrochléennes', 'Inguinales']),
        field.radio('ganglions_resultat', 'Résultat', ['Libres', 'Adénopathies', 'Non examinées']),
        field.textarea('ganglions_details', 'Si adénopathie : localisation, nombre, taille, consistance, mobilité, sensibilité, signes associés', { full: true }),
        field.radio('thyroide_general', 'Palpation thyroïdienne', ['Non palpable', 'Normale', 'Goitre homogène', 'Goitre nodulaire', 'Nodule isolé']),
        field.textarea('thyroide_details', 'Précisions sur la thyroïde / aires ganglionnaires cervicales', { full: true })
      ]}
    ]
  },
  {
    id: 'neuro', number: '05', title: 'Examen neurologique', subtitle: 'Marche, motricité, réflexes, sensibilité, nerfs crâniens et fonctions supérieures', groups: [
      { title: 'Marche et station debout', fields: [
        field.radio('neuro_marche', 'Marche', ['Normale', 'Autonome', 'Aidée', 'Impossible']),
        field.checks('neuro_type_marche', 'Types de marche recherchés', ['Spastique (fauchage)', 'Ataxique (cérébelleuse)', 'Steppante', 'Dandinante', 'À petits pas (parkinsonienne)', 'Talonnante']),
        field.radio('neuro_station_yeux_ouverts', 'Station debout, yeux ouverts', ['Stable', 'Instable', 'Impossible']),
        field.radio('neuro_romberg', 'Romberg (yeux fermés)', ['Négatif', 'Positif', 'Non réalisé']),
        field.radio('neuro_monopodal', 'Appui monopodal', ['Possible', 'Impossible', 'Non réalisé']),
        field.textarea('neuro_marche_details', 'Vitesse, amplitude, orientation, régularité, aide nécessaire', { full: true })
      ]},
      { title: 'Force musculaire · testing global et segmentaire', hint: 'Cotation : 0 aucune contraction · 1 visible · 2 sans pesanteur · 3 contre pesanteur · 4 contre résistance · 5 normal.', fields: [
        field.radio('neuro_barre', 'Manœuvre de Barré (MS)', ['Négative · maintien', 'Positive · chute d’un bras', 'Non réalisée']),
        field.radio('neuro_mingazzini', 'Manœuvre de Mingazzini (MI)', ['Négative · maintien', 'Positive · chute d’une jambe', 'Non réalisée']),
        field.select('neuro_force_ms_d', 'Force MS droit', ['0/5', '1/5', '2/5', '3/5', '4/5', '5/5']),
        field.select('neuro_force_ms_g', 'Force MS gauche', ['0/5', '1/5', '2/5', '3/5', '4/5', '5/5']),
        field.select('neuro_force_mi_d', 'Force MI droit', ['0/5', '1/5', '2/5', '3/5', '4/5', '5/5']),
        field.select('neuro_force_mi_g', 'Force MI gauche', ['0/5', '1/5', '2/5', '3/5', '4/5', '5/5']),
        field.textarea('neuro_force_details', 'Testing musculaire par groupe / segment, comparaison droite-gauche', { full: true })
      ]},
      { title: 'Tonus et trophicité', fields: [
        field.checks('neuro_trophicite', 'Inspection musculaire', ['Normale', 'Hypertrophie', 'Amyotrophie']),
        field.radio('neuro_tonus', 'Mobilisation passive', ['Normal', 'Hypotonie', 'Hypertonie']),
        field.checks('neuro_hypertonie', 'Type d’hypertonie', ['Spastique', 'Plastique', 'Roue dentée']),
        field.textarea('neuro_tonus_details', 'Précisions (siège, distribution, asymétrie)', { full: true })
      ]},
      { title: 'Réflexes ostéo-tendineux et cutanés', fields: [
        field.checks('neuro_rot_global', 'ROT', ['Présents', 'Abolis', 'Vifs', 'Symétriques', 'Asymétriques', 'Polycinétiques', 'Diffusés']),
        field.radio('neuro_rot_bicipital_d', 'Bicipital droit (C5)', ['Présent', 'Diminué', 'Aboli', 'Vif']),
        field.radio('neuro_rot_bicipital_g', 'Bicipital gauche (C5)', ['Présent', 'Diminué', 'Aboli', 'Vif']),
        field.radio('neuro_rot_tricipital_d', 'Tricipital droit (C7)', ['Présent', 'Diminué', 'Aboli', 'Vif']),
        field.radio('neuro_rot_tricipital_g', 'Tricipital gauche (C7)', ['Présent', 'Diminué', 'Aboli', 'Vif']),
        field.radio('neuro_rot_stylo_d', 'Stylo-radial droit', ['Présent', 'Diminué', 'Aboli', 'Vif']),
        field.radio('neuro_rot_stylo_g', 'Stylo-radial gauche', ['Présent', 'Diminué', 'Aboli', 'Vif']),
        field.radio('neuro_rot_rotulien_d', 'Rotulien droit (L4)', ['Présent', 'Diminué', 'Aboli', 'Vif']),
        field.radio('neuro_rot_rotulien_g', 'Rotulien gauche (L4)', ['Présent', 'Diminué', 'Aboli', 'Vif']),
        field.radio('neuro_rot_achilleen_d', 'Achilléen droit (S1)', ['Présent', 'Diminué', 'Aboli', 'Vif']),
        field.radio('neuro_rot_achilleen_g', 'Achilléen gauche (S1)', ['Présent', 'Diminué', 'Aboli', 'Vif']),
        field.radio('neuro_babinski', 'Réflexe cutanéo-plantaire (Babinski)', ['Réponse normale · flexion des orteils', 'Babinski positif · extension du gros orteil', 'Indéterminé / non réalisé']),
        field.radio('neuro_rca', 'Réflexe cutanéo-abdominal (RCA)', ['Présent', 'Aboli', 'Asymétrique', 'Non réalisé']),
        field.radio('neuro_cremasterien', 'Réflexe crémastérien (si indiqué)', ['Présent', 'Aboli', 'Non réalisé']),
        field.textarea('neuro_reflexes_details', 'Autres précisions sur les réflexes', { full: true })
      ]},
      { title: 'Sensibilité', fields: [
        field.radio('neuro_sensibilite_superficielle', 'Sensibilité superficielle (tactile, thermique, algique)', ['Conservée', 'Diminuée', 'Abolie', 'Asymétrique']),
        field.radio('neuro_sensibilite_profonde', 'Sensibilité profonde (position, vibratoire)', ['Conservée', 'Altérée', 'Abolie', 'Asymétrique']),
        field.textarea('neuro_sensibilite_details', 'Topographie, niveau sensitif, territoire et comparaison droite-gauche', { full: true })
      ]},
      { title: 'Coordination motrice', fields: [
        field.radio('neuro_doigt_nez', 'Épreuve doigt-nez', ['Normale', 'Dysmétrie', 'Hypermétrie', 'Non réalisée']),
        field.radio('neuro_talon_genou', 'Épreuve talon-genou', ['Normale', 'Dysmétrie', 'Non réalisée']),
        field.radio('neuro_marionnettes', 'Épreuve des marionnettes', ['Normale', 'Adiadococinésie', 'Dyschronométrie', 'Non réalisée']),
        field.textarea('neuro_coordination_details', 'Autres épreuves et précisions', { full: true })
      ]},
      { title: 'Nerfs crâniens I à XII', fields: [
        field.radio('nc_i', 'I · Olfactif', ['Normal', 'Hyposmie', 'Anosmie', 'Non testé']),
        field.radio('nc_ii_acuite', 'II · Optique : acuité visuelle', ['Normale', 'Diminuée', 'Non évaluée']),
        field.radio('nc_ii_champ', 'II · Champ visuel', ['Normal', 'Amputé', 'Non évalué']),
        field.radio('nc_ii_fo', 'II · Fond d’œil', ['Normal', 'Œdème papillaire', 'Hémorragies', 'Non réalisé']),
        field.checks('nc_iii_signes', 'III · Oculomoteur commun', ['Ptosis', 'Mydriase']),
        field.radio('nc_iii_mouvements', 'III · Mouvements oculaires', ['Possibles', 'Limités']),
        field.radio('nc_iii_rpm', 'III · Réflexe photomoteur', ['Présent', 'Absent', 'Asymétrique']),
        field.radio('nc_iv', 'IV · Pathétique / trochléaire', ['Normal', 'Diplopie verticale', 'Non évalué']),
        field.radio('nc_v_sensibilite', 'V · Trijumeau : sensibilité faciale', ['Conservée', 'Altérée']),
        field.radio('nc_v_corneen', 'V · Réflexe cornéen', ['Présent', 'Absent', 'Non réalisé']),
        field.radio('nc_v_massetters', 'V · Muscles masséters', ['Normaux', 'Amyotrophie']),
        field.radio('nc_vi', 'VI · Oculomoteur externe', ['Mouvement latéral possible', 'Limitation / strabisme convergent']),
        field.radio('nc_vii_symetrie', 'VII · Facial : symétrie', ['Symétrique', 'Asymétrie']),
        field.radio('nc_vii_bell', 'VII · Signe de Charles Bell', ['Positif', 'Négatif', 'Non évalué']),
        field.radio('nc_vii_souques', 'VII · Cils de Souques', ['Positif', 'Négatif', 'Non évalué']),
        field.radio('nc_vii_motricite', 'VII · Motricité (sifflement, gonfler les joues)', ['Normale', 'Déficitaire']),
        field.radio('nc_viii_audition', 'VIII · Audition', ['Normale', 'Hypoacousie', 'Non évaluée']),
        field.checks('nc_viii_equilibre', 'VIII · Équilibre', ['Normal', 'Vertige', 'Nystagmus']),
        field.radio('nc_ix_deglutition', 'IX · Déglutition', ['Normale', 'Dysphagie']),
        field.radio('nc_ix_nauséeux', 'IX · Réflexe nauséeux', ['Présent', 'Aboli', 'Non réalisé']),
        field.radio('nc_ix_rideau', 'IX · Signe du rideau', ['Positif', 'Négatif', 'Non évalué']),
        field.radio('nc_x_voix', 'X · Vague : voix', ['Normale', 'Dysphonie']),
        field.radio('nc_xi_epaules', 'XI · Spinal : épaules', ['Symétriques', 'Asymétriques']),
        field.radio('nc_xi_force', 'XI · Mouvements contre résistance', ['Normaux', 'Déficitaires']),
        field.radio('nc_xii_langue', 'XII · Hypoglosse : langue', ['Médiane', 'Déviation']),
        field.radio('nc_xii_fasciculations', 'XII · Fasciculations', ['Présentes', 'Absentes']),
        field.radio('nc_xii_amyotrophie', 'XII · Amyotrophie linguale', ['Présente', 'Absente']),
        field.textarea('neuro_nc_details', 'Autres constatations des nerfs crâniens', { full: true })
      ]},
      { title: 'Fonctions supérieures', fields: [
        field.radio('neuro_memoire', 'Mémoire', ['Conservée', 'Altérée']),
        field.text('neuro_memoire_type', 'Si altérée : immédiate / récente / ancienne'),
        field.radio('neuro_langage', 'Langage', ['Normal', 'Aphasie de Broca', 'Aphasie de Wernicke', 'Dysarthrie', 'Mutisme']),
        field.radio('neuro_praxies', 'Praxies', ['Normales', 'Apraxie idéatoire', 'Apraxie idéomotrice', 'Apraxie de l’habillage']),
        field.radio('neuro_gnosies', 'Gnosies', ['Normales', 'Agnosie visuelle', 'Agnosie auditive', 'Astéréognosie']),
        field.radio('neuro_orientation', 'Orientation', ['Conservée', 'Désorientation temporelle', 'Désorientation spatiale', 'Désorientation temporo-spatiale']),
        field.textarea('neuro_superieur_details', 'Autres éléments des fonctions supérieures', { full: true })
      ]},
      { title: 'Signes méningés', fields: [
        field.radio('neuro_raideur_nuque', 'Raideur de nuque', ['Présente', 'Absente', 'Non recherchée']),
        field.radio('neuro_kernig', 'Signe de Kernig', ['Négatif', 'Positif', 'Non réalisé']),
        field.radio('neuro_brudzinski', 'Signe de Brudzinski', ['Négatif', 'Positif', 'Non réalisé']),
        field.textarea('neuro_meninge_details', 'Description et autres signes méningés', { full: true })
      ]}
    ]
  },
  {
    id: 'cardio', number: '06', title: 'Examen cardio-vasculaire', subtitle: 'Inspection, palpation, pouls et auscultation des foyers', groups: [
      { title: 'Inspection', fields: [
        field.checks('cv_inspection', 'Éléments recherchés', ['Thorax symétrique', 'Cyanose', 'Turgescence jugulaire', 'Œdèmes des membres inférieurs', 'Circulation veineuse collatérale', 'Varices', 'Marbrures', 'Hippocratisme digital']),
        field.radio('cv_oedeme_godet', 'Œdèmes : godet', ['Absent', 'Présent', 'Non évalué']),
        field.textarea('cv_inspection_details', 'Autres éléments à l’inspection', { full: true })
      ]},
      { title: 'Palpation', fields: [
        field.radio('cv_choc_pointe', 'Choc de pointe', ['Normal · 5e EIC gauche, ligne médio-claviculaire', 'Dévié', 'Étendu', 'Non perçu']),
        field.checks('cv_pouls', 'Pouls périphériques examinés', ['Carotidien', 'Huméral', 'Radial', 'Fémoral', 'Poplité', 'Pédieux', 'Tibial postérieur']),
        field.radio('cv_pouls_resultat', 'Pouls périphériques', ['Présents et symétriques', 'Diminués', 'Abolis', 'Asymétriques']),
        field.number('cv_pouls_frequence', 'Fréquence du pouls', 'bpm'),
        field.radio('cv_rhj', 'Reflux hépato-jugulaire', ['Positif', 'Négatif', 'Non réalisé']),
        field.radio('cv_harzer', 'Signe de Harzer', ['Positif', 'Négatif', 'Non recherché']),
        field.text('cv_ta_assis', 'TA en position assise (ex. 120/80 mmHg)'),
        field.text('cv_ta_debout', 'TA en position debout (ex. 120/80 mmHg)'),
        field.textarea('cv_palpation_details', 'Frémissement / thrill, choc de pointe et autres précisions', { full: true })
      ]},
      { title: 'Auscultation cardiaque', fields: [
        field.checks('cv_foyers', 'Foyers auscultés', ['Aortique · 2e EIC droit', 'Pulmonaire · 2e EIC gauche', 'Tricuspide · 4e EIC gauche', 'Mitral · 5e EIC gauche']),
        field.radio('cv_bruits', 'Bruits B1 et B2', ['Normaux / bien perçus', 'Assourdis', 'Renforcés', 'Anormaux']),
        field.radio('cv_rythme', 'Rythme', ['Régulier', 'Irrégulier']),
        field.radio('cv_souffle', 'Souffle cardiaque', ['Absent', 'Présent']),
        field.checks('cv_souffle_type', 'Si souffle : temps', ['Systolique', 'Diastolique', 'Continu']),
        field.select('cv_levine', 'Intensité (Levine)', ['I/VI', 'II/VI', 'III/VI', 'IV/VI', 'V/VI', 'VI/VI']),
        field.text('cv_irradiation', 'Irradiation du souffle'),
        field.checks('cv_bruits_surajoutes', 'Bruits surajoutés', ['B3', 'B4', 'Galop', 'Frottement péricardique', 'Claquement']),
        field.textarea('cv_auscultation_details', 'Description par foyer, siège, temps, intensité et irradiation', { full: true })
      ]},
      { title: 'Axes vasculaires et périphérie', fields: [
        field.radio('cv_carotides', 'Auscultation carotidienne', ['Pas de souffle', 'Souffle présent', 'Non réalisée']),
        field.radio('cv_axes', 'Autres axes vasculaires', ['Pas de souffle', 'Souffle présent', 'Non réalisés']),
        field.textarea('cv_vasculaire_details', 'Autres constatations vasculaires / signes d’insuffisance cardiaque', { full: true })
      ]}
    ]
  },
  {
    id: 'respiratoire', number: '07', title: 'Examen pleuro-pulmonaire', subtitle: 'Inspection, vibrations vocales, percussion et auscultation', groups: [
      { title: 'Inspection', fields: [
        field.checks('resp_inspection', 'Signes recherchés', ['Thorax symétrique', 'Tirage', 'Battement des ailes du nez', 'Cyanose', 'Thorax en tonneau', 'Cyphoscoliose', 'Inspiration forcée', 'Polypnée']),
        field.number('resp_fr', 'Fréquence respiratoire', 'cycles/min'),
        field.textarea('resp_inspection_details', 'Type respiratoire, ampliation visible, déformation thoracique', { full: true })
      ]},
      { title: 'Palpation', fields: [
        field.radio('resp_vv', 'Vibrations vocales', ['Normales', 'Diminuées', 'Abolies', 'Augmentées']),
        field.radio('resp_ampliation', 'Ampliation thoracique', ['Symétrique', 'Asymétrique', 'Diminuée']),
        field.textarea('resp_palpation_details', 'Douleur provoquée, localisation et autres constatations', { full: true })
      ]},
      { title: 'Percussion', fields: [
        field.radio('resp_percussion', 'Sonorité', ['Normale', 'Matité', 'Tympanisme', 'Hypersonorité']),
        field.textarea('resp_percussion_details', 'Topographie de la matité / du tympanisme', { full: true })
      ]},
      { title: 'Auscultation', fields: [
        field.radio('resp_mv', 'Murmure vésiculaire', ['Normal', 'Diminué', 'Aboli', 'Souffle tubaire']),
        field.checks('resp_rales', 'Bruits surajoutés / râles', ['Crépitants', 'Sibilants', 'Ronflants', 'Sous-crépitants']),
        field.radio('resp_frottement', 'Frottement pleural', ['Présent', 'Absent']),
        field.textarea('resp_auscultation_details', 'Résultats par champ pulmonaire, symétrie et autres bruits', { full: true })
      ]}
    ]
  },
  {
    id: 'abdomen', number: '08', title: 'Examen abdominal et digestif', subtitle: 'Inspection, palpation, percussion, auscultation et toucher rectal', groups: [
      { title: 'Inspection', fields: [
        field.checks('abd_inspection', 'Aspect abdominal', ['Symétrique', 'Distendu', 'Cicatrices', 'Circulation veineuse collatérale', 'Hernie inguinale', 'Hernie crurale', 'Hernie ombilicale', 'Ecchymoses', 'Angiomes stellaires', 'Voussure']),
        field.radio('abd_mouvements_resp', 'Mouvements respiratoires abdominaux', ['Présents', 'Absents']),
        field.textarea('abd_inspection_details', 'Ombilic, paroi, orifices herniaires et autres éléments', { full: true })
      ]},
      { title: 'Cavité buccale', fields: [
        field.checks('abd_bouche', 'Éléments examinés', ['Ouverture normale', 'Ouverture limitée', 'Bonne hygiène', 'Caries', 'Absences dentaires', 'Prothèses', 'Langue lisse', 'Gingivorragies', 'Mauvaise haleine', 'Candidose']),
        field.textarea('abd_bouche_details', 'Description de la cavité buccale', { full: true })
      ]},
      { title: 'Palpation abdominale (quadrant par quadrant)', fields: [
        field.radio('abd_paroi', 'Souplesse de l’abdomen', ['Souple', 'Défense', 'Contracture']),
        field.radio('abd_douleur', 'Douleur à la palpation', ['Absente', 'Présente']),
        field.checks('abd_localisation_douleur', 'Localisation de la douleur', ['FID', 'FIG', 'HCD', 'HCG', 'Épigastre', 'Péri-ombilicale', 'Hypogastre', 'Diffusée']),
        field.radio('abd_mcburney', 'Point de McBurney (FID)', ['Négatif', 'Positif', 'Non recherché']),
        field.radio('abd_murphy', 'Signe de Murphy (HCD)', ['Négatif', 'Positif', 'Non recherché']),
        field.radio('abd_foie', 'Foie', ['Non palpable', 'Palpable']),
        field.number('abd_fleche_hepatique', 'Flèche hépatique', 'cm'),
        field.text('abd_foie_consistance', 'Consistance / sensibilité du foie'),
        field.radio('abd_rate', 'Rate', ['Non palpable', 'Splénomégalie']),
        field.radio('abd_ascite', 'Épanchement liquidien / ascite', ['Absent', 'Présent', 'Douteux']),
        field.radio('abd_rebond', 'Signe du rebond', ['Négatif', 'Positif', 'Non recherché']),
        field.radio('abd_contact_lombaire', 'Contact lombaire / douleur lombaire', ['Absent', 'Présent', 'Non recherché']),
        field.radio('abd_globe', 'Globe vésical', ['Absent', 'Présent']),
        field.radio('abd_masse', 'Masse abdominale', ['Absente', 'Présente']),
        field.textarea('abd_masse_details', 'Si masse : localisation, taille, consistance, mobilité, limites et signes associés', { full: true }),
        field.textarea('abd_palpation_details', 'Autres constatations par quadrant (défense, sensibilité, contact lombaire…)', { full: true })
      ]},
      { title: 'Percussion et auscultation', fields: [
        field.radio('abd_percussion', 'Percussion', ['Tympanisme normal', 'Matité', 'Matité déclive / signe du flot', 'Autre']),
        field.radio('abd_bha', 'Bruits hydro-aériques (BHA)', ['Présents', 'Absents', 'Augmentés', 'Diminués']),
        field.radio('abd_souffle', 'Souffle abdominal', ['Absent', 'Présent']),
        field.textarea('abd_auscultation_details', 'Précisions sur les bruits intestinaux et souffles vasculaires', { full: true })
      ]},
      { title: 'Toucher rectal (si indiqué et avec consentement)', fields: [
        field.radio('tr_marge', 'Marge anale', ['Normale', 'Fissure', 'Hémorroïdes', 'Prolapsus', 'Autre']),
        field.radio('tr_tonicite', 'Tonicité sphinctérienne', ['Normale', 'Hypotonie', 'Hypertonie']),
        field.radio('tr_prostate', 'Prostate (si concerné)', ['Normale / souple', 'Hypertrophiée', 'Douloureuse', 'Nodulaire', 'Non évaluée']),
        field.radio('tr_sang', 'Sang sur le doigtier', ['Oui', 'Non', 'Non recherché']),
        field.textarea('tr_details', 'Paroi rectale, ampoule rectale, Douglas et autres constatations', { full: true })
      ]}
    ]
  },
  {
    id: 'urogyneco', number: '09', title: 'Examen uro-génital et gynécologique', subtitle: 'À adapter au sexe, au motif et à l’indication clinique', groups: [
      { title: 'Examen uro-génital', fields: [
        field.radio('uro_mictions', 'Mictions', ['Normales', 'Dysurie', 'Pollakiurie', 'Brûlures mictionnelles', 'Hématurie', 'Rétention']),
        field.radio('uro_bourses', 'Bourses (si concerné)', ['Normales', 'Augmentées de volume', 'Inflammatoires']),
        field.radio('uro_testicules', 'Testicules (si concerné)', ['Normaux', 'Nodule', 'Douloureux', 'Non examinés']),
        field.radio('uro_epididyme', 'Épididyme', ['Normal', 'Douloureux', 'Augmenté de volume', 'Non examiné']),
        field.textarea('uro_details', 'Autres éléments uro-génitaux (loges rénales, organes génitaux externes…)', { full: true })
      ]},
      { title: 'Examen gynécologique (si indiqué)', fields: [
        field.radio('gyne_seins_symetrie', 'Seins', ['Symétriques', 'Asymétriques']),
        field.checks('gyne_seins_anomalies', 'Anomalies mammaires', ['Nodule', 'Écoulement mamelonnaire', 'Rétraction mamelonnaire', 'Rougeur', 'Douleur']),
        field.radio('gyne_speculum_col', 'Spéculum : col', ['Normal', 'Bourgeonnant', 'Saignant au contact', 'Leucorrhée', 'Non réalisé']),
        field.radio('gyne_tv_uterus_taille', 'Toucher vaginal : utérus', ['Taille normale', 'Augmenté de taille', 'Non évalué']),
        field.radio('gyne_tv_position', 'Position utérine', ['Antéversé', 'Rétroversé', 'Autre', 'Non évaluée']),
        field.radio('gyne_tv_consistance', 'Consistance utérine', ['Souple', 'Ferme', 'Dure', 'Non évaluée']),
        field.radio('gyne_tv_annexes', 'Annexes', ['Libres', 'Masse', 'Douloureuses', 'Non évaluées']),
        field.textarea('gyne_examen_details', 'Vulve, parois vaginales, col, utérus, annexes et constatations complémentaires', { full: true }),
        field.text('gyne_consentement', 'Consentement / accompagnant / conditions de réalisation')
      ]}
    ]
  },
  {
    id: 'locomoteur', number: '10', title: 'Examen ostéo-articulaire et rachis', subtitle: 'Examen axial, amplitudes, manœuvres radiculaires et articulations périphériques', groups: [
      { title: 'Rachis · inspection et palpation', fields: [
        field.checks('rachis_inspection', 'Inspection', ['Attitude normale', 'Cyphose', 'Scoliose', 'Lordose', 'Contracture paravertébrale']),
        field.radio('rachis_sonnette', 'Douleur à la pression des épineuses / signe de la sonnette', ['Positif', 'Négatif', 'Non recherché']),
        field.textarea('rachis_palpation', 'Palpation des épineuses, masses musculaires et articulations sacro-iliaques', { full: true })
      ]},
      { title: 'Mobilité rachidienne et mesures', fields: [
        field.radio('rachis_schober', 'Indice de Schöber lombaire', ['Normal', 'Raideur / limitation', 'Non mesuré']),
        field.number('rachis_schober_mesure', 'Mesure de Schöber', 'cm'),
        field.radio('rachis_dms', 'Distance main-sol (DMS)', ['Normale', 'Limitée', 'Non mesurée']),
        field.number('rachis_dms_mesure', 'Distance main-sol', 'cm'),
        field.radio('rachis_menton', 'Distance menton-sternum / occiput-mur', ['Normale', 'Limitée', 'Non mesurée']),
        field.radio('rachis_ampliation', 'Ampliation thoracique', ['Normale', 'Diminuée', 'Non mesurée']),
        field.textarea('rachis_mobilite_details', 'Flexion, extension, inclinaisons et rotations', { full: true })
      ]},
      { title: 'Manœuvres radiculaires', fields: [
        field.radio('rachis_lasegue', 'Lasègue (sciatique)', ['Négatif', 'Positif', 'Non réalisé']),
        field.radio('rachis_leri', 'Léri (cruralgie)', ['Négatif', 'Positif', 'Non réalisé']),
        field.radio('rachis_spurling', 'Spurling (cervicalgie)', ['Négatif', 'Positif', 'Non réalisé']),
        field.textarea('rachis_radiculaires_details', 'Côté, angle, territoire douloureux et irradiations', { full: true })
      ]},
      { title: 'Examen articulaire périphérique', fields: [
        field.radio('art_epaule_mobilite', 'Épaule : mobilité', ['Normale', 'Limitée', 'Douloureuse']),
        field.checks('art_epaule_tests', 'Tests de l’épaule', ['Jobe', 'Neer', 'Yocum']),
        field.checks('art_genou', 'Genou', ['Épanchement / choc rotulien', 'Tiroir antérieur', 'Tiroir postérieur', 'Lachman', 'Signe du flot']),
        field.radio('art_hanche', 'Hanche', ['Mobilité normale', 'Rotation interne douloureuse', 'Mobilité limitée']),
        field.textarea('art_autres', 'Autres articulations : inspection, palpation, chaleur, rougeur, douleur, mobilité active/passive et amplitudes', { full: true })
      ]}
    ]
  },
  {
    id: 'orl_ophta', number: '11', title: 'Examens ORL et ophtalmologique', subtitle: 'Oreilles, nez, gorge, cou, vision et fond d’œil', groups: [
      { title: 'Examen ORL', fields: [
        field.radio('orl_pavillon', 'Oreille : pavillon', ['Normal', 'Malformation', 'Lésion']),
        field.radio('orl_conduit', 'Conduit auditif', ['Libre', 'Bouchon', 'Écoulement']),
        field.radio('orl_tympan', 'Tympan', ['Normal', 'Bombé', 'Perforé', 'Non visualisé']),
        field.radio('orl_fosses', 'Fosses nasales', ['Perméables', 'Obstruction', 'Polypes']),
        field.radio('orl_sinus', 'Sinus', ['Indolores', 'Douloureux']),
        field.radio('orl_amygdales', 'Amygdales', ['Normales', 'Hypertrophiées', 'Exsudat']),
        field.radio('orl_larynx', 'Larynx / voix', ['Voix normale', 'Dysphonie', 'Lésion suspectée / visualisée']),
        field.radio('orl_thyroide', 'Cou / thyroïde', ['Non palpable', 'Goitre homogène', 'Goitre nodulaire', 'Nodule']),
        field.radio('orl_ganglions', 'Ganglions cervicaux', ['Libres', 'Adénopathies']),
        field.textarea('orl_details', 'Autres constatations ORL et cervicales', { full: true })
      ]},
      { title: 'Examen ophtalmologique', fields: [
        field.radio('ophta_acuite', 'Acuité visuelle', ['Normale', 'Diminuée']),
        field.text('ophta_acuite_droite', 'Acuité visuelle œil droit'),
        field.text('ophta_acuite_gauche', 'Acuité visuelle œil gauche'),
        field.radio('ophta_champ', 'Champ visuel', ['Normal', 'Amputé', 'Non évalué']),
        field.radio('ophta_rpm', 'Réflexe photomoteur (RPM)', ['Présent', 'Absent', 'Asymétrique']),
        field.radio('ophta_segment', 'Segment antérieur', ['Conjonctive normale', 'Rougeur', 'Kératite', 'Autre']),
        field.radio('ophta_fond', 'Fond d’œil', ['Normal', 'Œdème papillaire', 'Hémorragies', 'Non réalisé']),
        field.textarea('ophta_details', 'Autres éléments : pupilles, motilité oculaire, douleur, photophobie, annexes', { full: true })
      ]}
    ]
  },
  {
    id: 'endocrino_psy', number: '12', title: 'Examens endocrinien et psychiatrique', subtitle: 'Signes endocriniens et examen de l’état mental', groups: [
      { title: 'Examen endocrinien', fields: [
        field.radio('endo_thyroide', 'Thyroïde', ['Normale', 'Goitre', 'Nodule', 'Non examinée']),
        field.checks('endo_hyper', 'Signes évocateurs d’hyperthyroïdie', ['Amaigrissement', 'Tachycardie', 'Tremblements', 'Exophtalmie']),
        field.checks('endo_hypo', 'Signes évocateurs d’hypothyroïdie', ['Prise de poids', 'Bradycardie', 'Peau sèche', 'Frilosité']),
        field.checks('endo_cushing', 'Signes évocateurs d’hypercorticisme', ['Obésité facio-tronculaire', 'Vergetures pourpres']),
        field.checks('endo_surrenale', 'Signes évocateurs d’insuffisance surrénale', ['Mélanodermie', 'Hypotension']),
        field.textarea('endo_details', 'Autres signes endocriniens / trophiques', { full: true })
      ]},
      { title: 'Examen psychiatrique', fields: [
        field.radio('psy_presentation', 'Présentation', ['Calme', 'Agité', 'Agressif', 'Négligé']),
        field.radio('psy_contact', 'Contact', ['Facile', 'Difficile', 'Méfiant']),
        field.radio('psy_langage', 'Langage', ['Normal', 'Logorrhée', 'Mutisme', 'Incohérent']),
        field.radio('psy_humeur', 'Humeur', ['Normale', 'Dépressive', 'Euphorique', 'Irritable']),
        field.radio('psy_pensee', 'Pensée', ['Cohérente', 'Dissociée', 'Délirante']),
        field.text('psy_delire_type', 'Si délire : thème (persécution, grandeur…)'),
        field.radio('psy_perception', 'Perception', ['Normale', 'Hallucinations auditives', 'Hallucinations visuelles', 'Autres hallucinations']),
        field.radio('psy_risque_suicidaire', 'Risque suicidaire', ['Évalué', 'Non évalué']),
        field.textarea('psy_risque_details', 'Idées, intention, plan, moyens, facteurs de protection et mesures prises', { full: true }),
        field.textarea('psy_details', 'Autres éléments de l’examen psychiatrique', { full: true })
      ]}
    ]
  },
  {
    id: 'synthese', number: '13', title: 'Conclusion, examens complémentaires et CAT', subtitle: 'Regroupement syndromique, hypothèses argumentées et prise en charge', groups: [
      { title: 'Conclusion clinique', fields: [
        field.textarea('conclusion_resume', 'Résumé clinique (âge, sexe, terrain, antécédents utiles, motif et éléments essentiels)', { full: true }),
        field.textarea('conclusion_syndromes', 'Regroupement syndromique', { full: true, placeholder: 'Ex. syndrome méningé, syndrome pyramidal, syndrome de détresse respiratoire…' }),
        field.textarea('conclusion_positifs', 'Signes positifs pertinents', { full: true }),
        field.textarea('conclusion_negatifs', 'Signes négatifs pertinents', { full: true })
      ]},
      { title: 'Hypothèses diagnostiques', fields: [
        field.textarea('diagnostic_principal', 'Diagnostic principal envisagé · arguments pour / contre', { full: true }),
        field.textarea('diagnostics_differentiels', 'Diagnostics différentiels · arguments pour / contre', { full: true }),
        field.textarea('raisonnement', 'Raisonnement clinique (terrain, ATCD, fréquence, anamnèse, clinique, paraclinique, différentiels)', { full: true })
      ]},
      { title: 'Examens complémentaires', fields: [
        field.textarea('examens_biologie', 'Biologie (examens, dates et résultats)', { full: true, placeholder: 'NFS, CRP, ionogramme, bilan hépatique, bilan rénal…' }),
        field.textarea('examens_imagerie', 'Imagerie (examens, dates et résultats)', { full: true, placeholder: 'Radiographie, échographie, scanner, IRM…' }),
        field.textarea('examens_autres', 'Autres examens (ECG, EEG, endoscopie, biopsie…)', { full: true }),
        field.textarea('examens_a_demander', 'Examens à demander / hiérarchisation', { full: true, placeholder: 'Urgence, utilité, caractère invasif, disponibilité…' })
      ]},
      { title: 'Conduite à tenir et surveillance', fields: [
        field.textarea('cat_diagnostique', 'CAT diagnostique · examens prioritaires', { full: true }),
        field.textarea('cat_therapeutique', 'CAT thérapeutique · traitement symptomatique et étiologique', { full: true }),
        field.textarea('cat_surveillance', 'Surveillance clinique et paraclinique · efficacité, tolérance et complications', { full: true }),
        field.textarea('evolution_pronostic', 'Évolution, suivi et pronostic', { full: true }),
        field.textarea('consentement', 'Consentement / information du patient / discussion collégiale si nécessaire', { full: true }),
        field.textarea('notes_libres', 'Notes complémentaires', { full: true })
      ]}
    ]
  }
];

let dbPromise;
let currentRecord = null;
let observationsCache = [];
let saveTimer = null;
let isLoadingRecord = false;

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function uid() {
  return (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : `obs-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB n’est pas disponible dans ce navigateur.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Impossible d’ouvrir la base locale.'));
  });
  return dbPromise;
}

async function dbGetAll() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(record) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('Échec de sauvegarde.'));
    tx.onabort = () => reject(tx.error || new Error('Sauvegarde annulée.'));
  });
}

async function dbDelete(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

function formatDate(dateValue, withTime = false) {
  if (!dateValue) return 'Date non précisée';
  const date = new Date(dateValue.length === 10 ? `${dateValue}T12:00:00` : dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue);
  return new Intl.DateTimeFormat('fr-FR', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'long' }).format(date);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function renderField(f) {
  const fullClass = f.full ? ' full' : '';
  const label = `<label class="field-label" for="${escapeHtml(f.name)}">${escapeHtml(f.label)}</label>`;
  const helper = f.helper ? `<div class="helper-text">${escapeHtml(f.helper)}</div>` : '';
  if (f.type === 'computed') {
    return `<div class="field${fullClass}"><span class="field-label">${escapeHtml(f.label)}</span><div class="computed-box" id="computed-${escapeHtml(f.name)}">— <small>${escapeHtml(f.helper || '')}</small></div></div>`;
  }
  if (f.type === 'textarea') {
    const readOnly = f.readOnly ? ' readonly' : '';
    return `<div class="field${fullClass}">${label}<textarea id="${escapeHtml(f.name)}" name="${escapeHtml(f.name)}" placeholder="${escapeHtml(f.placeholder || 'Saisir les éléments…')}"${readOnly}></textarea>${helper}</div>`;
  }
  if (f.type === 'radio' || f.type === 'checks') {
    const inputType = f.type === 'radio' ? 'radio' : 'checkbox';
    const options = [...f.options, 'Autre'];
    const choices = options.map(opt => {
      const value = opt === 'Autre' ? OTHER_VALUE : opt;
      return `<label class="choice-option"><input type="${inputType}" name="${escapeHtml(f.name)}" value="${escapeHtml(value)}" data-choice="${escapeHtml(f.name)}"> <span>${escapeHtml(opt)}</span></label>`;
    }).join('');
    return `<div class="field${fullClass}">${label}<div class="choice-group">${choices}</div><input class="field-control other-input" type="text" name="${escapeHtml(f.name)}__other" data-other-input="${escapeHtml(f.name)}" placeholder="Préciser l'autre réponse…" hidden>${helper}</div>`;
  }
  if (f.type === 'select') {
    const options = ['<option value="">— Sélectionner —</option>', ...f.options.map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`), `<option value="${OTHER_VALUE}">Autre</option>`].join('');
    return `<div class="field${fullClass}">${label}<select id="${escapeHtml(f.name)}" name="${escapeHtml(f.name)}" data-choice="${escapeHtml(f.name)}">${options}</select><input class="field-control other-input" type="text" name="${escapeHtml(f.name)}__other" data-other-input="${escapeHtml(f.name)}" placeholder="Préciser l'autre réponse…" hidden>${helper}</div>`;
  }
  const type = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text';
  const step = f.step ? ` step="${escapeHtml(f.step)}"` : (type === 'number' ? ' step="any"' : '');
  const min = f.min !== undefined ? ` min="${f.min}"` : '';
  const max = f.max !== undefined ? ` max="${f.max}"` : '';
  const placeholder = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : '';
  const unit = f.unit ? `<span class="unit-label">${escapeHtml(f.unit)}</span>` : '';
  return `<div class="field${fullClass}">${label}<div class="field-unit"><input class="field-control" id="${escapeHtml(f.name)}" name="${escapeHtml(f.name)}" type="${type}"${step}${min}${max}${placeholder}>${unit}</div>${helper}</div>`;
}

function renderSchema() {
  const root = $('#form-sections');
  root.innerHTML = schema.map(section => `
    <details class="form-section" id="section-${escapeHtml(section.id)}" ${section.id === 'identite' ? 'open' : ''}>
      <summary>
        <span class="section-number">${escapeHtml(section.number)}</span>
        <span class="section-summary-copy"><strong>${escapeHtml(section.title)}</strong><small>${escapeHtml(section.subtitle)}</small></span>
        <span class="section-chevron">⌄</span>
      </summary>
      <div class="section-body">
        ${section.groups.map(group => `
          <section class="form-group">
            <h3 class="group-heading">${escapeHtml(group.title)}${group.hint ? `<span class="group-hint">${escapeHtml(group.hint)}</span>` : ''}</h3>
            <div class="fields-grid">${group.fields.map(renderField).join('')}</div>
          </section>
        `).join('')}
      </div>
    </details>
  `).join('');
}

function getFieldByName(name) {
  for (const section of schema) for (const group of section.groups) for (const f of group.fields) if (f.name === name) return f;
  return null;
}

function getFormData() {
  const data = {};
  for (const section of schema) {
    for (const group of section.groups) {
      for (const f of group.fields) {
        if (f.type === 'computed') continue;
        if (f.type === 'radio') {
          const selected = $(`input[name="${f.name}"]:checked`, $('#observation-form'));
          if (selected) data[f.name] = selected.value;
        } else if (f.type === 'checks') {
          data[f.name] = $$(`input[name="${f.name}"]:checked`, $('#observation-form')).map(el => el.value);
        } else {
          const control = $(`[name="${f.name}"]`, $('#observation-form'));
          if (control) data[f.name] = control.value;
        }
        const other = $(`[name="${f.name}__other"]`, $('#observation-form'));
        if (other && other.value.trim()) data[`${f.name}__other`] = other.value.trim();
      }
    }
  }
  data.imc_calcule = calculateBMI();
  data.gcs_total = calculateGCS();
  return data;
}

function fillForm(data = {}) {
  isLoadingRecord = true;
  const formEl = $('#observation-form');
  formEl.reset();
  for (const section of schema) {
    for (const group of section.groups) {
      for (const f of group.fields) {
        if (f.type === 'computed') continue;
        const value = data[f.name];
        if (f.type === 'radio') {
          if (value !== undefined) {
            const option = $$(`input[name="${f.name}"]`, formEl).find(el => el.value === value);
            if (option) option.checked = true;
          }
        } else if (f.type === 'checks') {
          const values = Array.isArray(value) ? value : (value ? [value] : []);
          $$(`input[name="${f.name}"]`, formEl).forEach(el => { el.checked = values.includes(el.value); });
        } else {
          const control = $(`[name="${f.name}"]`, formEl);
          if (control && value !== undefined && value !== null) control.value = value;
        }
        const other = $(`[name="${f.name}__other"]`, formEl);
        if (other) other.value = data[`${f.name}__other`] || '';
      }
    }
  }
  refreshOtherInputs();
  updateCalculations();
  isLoadingRecord = false;
}

function refreshOtherInputs() {
  for (const section of schema) for (const group of section.groups) for (const f of group.fields) {
    if (!['radio', 'checks', 'select'].includes(f.type)) continue;
    const selected = f.type === 'checks'
      ? $$(`input[name="${f.name}"]:checked`, $('#observation-form')).some(el => el.value === OTHER_VALUE)
      : (f.type === 'radio' ? $(`input[name="${f.name}"]:checked`, $('#observation-form'))?.value === OTHER_VALUE : $(`[name="${f.name}"]`, $('#observation-form'))?.value === OTHER_VALUE);
    const other = $(`[data-other-input="${f.name}"]`, $('#observation-form'));
    if (other) other.hidden = !selected;
  }
}

function calculateBMI() {
  const weight = parseFloat($('[name="poids"]', $('#observation-form'))?.value || '');
  const height = parseFloat($('[name="taille"]', $('#observation-form'))?.value || '');
  if (!weight || !height || height <= 0) return '';
  return (weight / (height * height)).toFixed(1);
}

function calculateGCS() {
  const values = [
    $('input[name="gcs_yeux"]:checked', $('#observation-form'))?.value,
    $('input[name="gcs_verbal"]:checked', $('#observation-form'))?.value,
    $('input[name="gcs_moteur"]:checked', $('#observation-form'))?.value
  ];
  if (values.some(v => !v)) return '';
  const scores = values.map(v => parseInt(v, 10));
  if (scores.some(n => Number.isNaN(n))) return '';
  return scores.reduce((sum, n) => sum + n, 0);
}

function updateCalculations() {
  const bmi = calculateBMI();
  const bmiEl = $('#computed-imc_calcule');
  if (bmiEl) bmiEl.innerHTML = `${bmi ? `${bmi} kg/m²` : '—'} <small>Poids ÷ taille²</small>`;
  const gcs = calculateGCS();
  const gcsEl = $('#computed-gcs_total');
  if (gcsEl) gcsEl.innerHTML = `${gcs ? `${gcs} / 15` : '— / 15'} <small>Y + V + M</small>`;
}

function createEmptyRecord() {
  const now = new Date().toISOString();
  return {
    id: uid(), createdAt: now, updatedAt: now,
    data: { date_observation: todayISO() },
    attachments: []
  };
}

function hasMeaningfulData(data) {
  return Object.entries(data || {}).some(([key, value]) => key !== 'date_observation' && value !== '' && value !== null && !(Array.isArray(value) && value.length === 0));
}

function patientTitle(record) {
  return record?.data?.patient_nom?.trim() || 'Patient sans nom';
}

function patientSubtitle(record) {
  const age = record?.data?.patient_age ? `${record.data.patient_age} ans` : '';
  const motif = record?.data?.motif_symptomes?.filter(v => v !== OTHER_VALUE).join(', ') || record?.data?.motif_autre || '';
  return [age, motif].filter(Boolean).join(' · ') || 'Observation médicale';
}

function setSaveStatus(status, message) {
  const el = $('#save-indicator');
  if (!el) return;
  el.classList.toggle('saved', status === 'saved');
  const text = status === 'saved' ? 'Enregistré localement' : status === 'saving' ? 'Enregistrement…' : status === 'error' ? 'Erreur de sauvegarde' : 'Brouillon';
  el.innerHTML = `<span class="status-dot"></span>${escapeHtml(message || text)}`;
}

function updatePageTitle() {
  const label = currentRecord ? patientTitle(currentRecord) : 'Nouvelle observation';
  $('#page-title').textContent = currentRecord && hasMeaningfulData(currentRecord.data) ? `Observation · ${label}` : 'Nouvelle observation';
  $('#breadcrumb-current').textContent = currentRecord && hasMeaningfulData(currentRecord.data) ? label : 'Nouvelle observation';
  $('#today-label').textContent = formatDate(currentRecord?.data?.date_observation || todayISO());
}

function showToast(message, type = 'success') {
  const node = document.createElement('div');
  node.className = `toast${type === 'error' ? ' error' : ''}`;
  node.textContent = message;
  $('#toast-region').appendChild(node);
  setTimeout(() => node.remove(), 3400);
}

async function refreshCache() {
  observationsCache = await dbGetAll();
  observationsCache.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  renderObservationList();
}

function renderObservationList() {
  const list = $('#observation-list');
  const query = ($('#search-observations').value || '').trim().toLocaleLowerCase('fr');
  const filtered = observationsCache.filter(record => {
    const text = `${patientTitle(record)} ${patientSubtitle(record)}`.toLocaleLowerCase('fr');
    return text.includes(query);
  });
  list.innerHTML = '';
  $('#observation-count').textContent = String(observationsCache.length);
  $('#empty-list').style.display = filtered.length ? 'none' : 'block';
  if (!filtered.length && query) $('#empty-list').querySelector('strong').textContent = 'Aucun résultat';
  else $('#empty-list').querySelector('strong').textContent = 'Aucune observation';

  for (const record of filtered) {
    const li = document.createElement('li');
    li.className = `observation-item${currentRecord?.id === record.id ? ' active' : ''}`;
    li.dataset.id = record.id;
    const title = document.createElement('div');
    title.className = 'observation-item-title';
    title.textContent = patientTitle(record);
    const subtitle = document.createElement('div');
    subtitle.className = 'observation-item-sub';
    subtitle.textContent = patientSubtitle(record);
    const date = document.createElement('div');
    date.className = 'observation-item-date';
    date.textContent = formatDate(record.updatedAt || record.createdAt, true);
    const actions = document.createElement('div');
    actions.className = 'observation-item-actions';
    const duplicate = document.createElement('button');
    duplicate.type = 'button'; duplicate.className = 'icon-action'; duplicate.title = 'Dupliquer'; duplicate.setAttribute('aria-label', 'Dupliquer'); duplicate.dataset.action = 'duplicate'; duplicate.textContent = '⧉';
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'icon-action'; remove.title = 'Supprimer'; remove.setAttribute('aria-label', 'Supprimer'); remove.dataset.action = 'delete'; remove.textContent = '×';
    actions.append(duplicate, remove);
    li.append(title, subtitle, date, actions);
    list.appendChild(li);
  }
}

async function saveCurrent(silent = false) {
  if (!currentRecord) currentRecord = createEmptyRecord();
  currentRecord.data = getFormData();
  currentRecord.updatedAt = new Date().toISOString();
  setSaveStatus('saving');
  try {
    await dbPut(currentRecord);
    await refreshCache();
    updatePageTitle();
    setSaveStatus('saved');
    if (!silent) showToast('Observation enregistrée sur cet appareil.');
    return true;
  } catch (error) {
    console.error(error);
    setSaveStatus('error');
    showToast(`Sauvegarde impossible : ${error.message || 'erreur inconnue'}`, 'error');
    return false;
  }
}

function scheduleAutosave() {
  if (isLoadingRecord) return;
  if (!currentRecord) currentRecord = createEmptyRecord();
  currentRecord.data = getFormData();
  updateCalculations();
  updatePageTitle();
  setSaveStatus('saving', 'Modifications en attente');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const hasContent = hasMeaningfulData(currentRecord.data) || currentRecord.attachments.length > 0;
    if (hasContent) await saveCurrent(true);
    else setSaveStatus('draft');
  }, 1000);
}

async function createNewObservation() {
  clearTimeout(saveTimer);
  if (currentRecord && hasMeaningfulData(getFormData())) await saveCurrent(true);
  currentRecord = createEmptyRecord();
  fillForm(currentRecord.data);
  renderAttachments();
  updatePageTitle();
  setSaveStatus('draft');
  renderObservationList();
  $$('.form-section').forEach((section, index) => { section.open = index === 0; });
  $('#section-identite').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#sidebar').classList.remove('open');
}

async function loadObservation(id) {
  clearTimeout(saveTimer);
  if (currentRecord && currentRecord.id !== id && hasMeaningfulData(getFormData())) await saveCurrent(true);
  try {
    const record = observationsCache.find(item => item.id === id) || (await dbGetAll()).find(item => item.id === id);
    if (!record) return;
    currentRecord = record;
    fillForm(record.data || {});
    renderAttachments();
    updatePageTitle();
    setSaveStatus('saved');
    renderObservationList();
    $('#sidebar').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    showToast(`Impossible d'ouvrir le dossier : ${error.message}`, 'error');
  }
}

async function duplicateObservation(id) {
  const record = observationsCache.find(item => item.id === id);
  if (!record) return;
  const copy = {
    ...record,
    id: uid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    data: { ...(record.data || {}), patient_nom: `${record.data?.patient_nom || 'Patient'} · Copie`, date_observation: todayISO() },
    attachments: [...(record.attachments || [])]
  };
  try {
    await dbPut(copy);
    await refreshCache();
    await loadObservation(copy.id);
    showToast('Une copie modifiable du dossier a été créée.');
  } catch (error) {
    showToast(`Duplication impossible : ${error.message}`, 'error');
  }
}

async function deleteObservation(id) {
  const record = observationsCache.find(item => item.id === id);
  if (!record) return;
  const ok = confirm(`Supprimer définitivement l'observation de « ${patientTitle(record)} » et ses pièces jointes de ce navigateur ?`);
  if (!ok) return;
  try {
    await dbDelete(id);
    if (currentRecord?.id === id) {
      currentRecord = createEmptyRecord();
      fillForm(currentRecord.data);
      renderAttachments();
      updatePageTitle();
      setSaveStatus('draft');
    }
    await refreshCache();
    showToast('Observation supprimée.');
  } catch (error) {
    showToast(`Suppression impossible : ${error.message}`, 'error');
  }
}

function renderAttachments() {
  const root = $('#attachment-list');
  root.innerHTML = '';
  const attachments = currentRecord?.attachments || [];
  if (!attachments.length) {
    const empty = document.createElement('div');
    empty.className = 'attachments-empty';
    empty.textContent = 'Aucun document joint à cette observation.';
    root.appendChild(empty);
    return;
  }
  for (const item of attachments) {
    const row = document.createElement('div');
    row.className = 'attachment-item';
    row.dataset.id = item.id;
    const icon = document.createElement('div'); icon.className = 'attachment-icon'; icon.textContent = 'PDF';
    const copy = document.createElement('div'); copy.className = 'attachment-copy';
    const name = document.createElement('strong'); name.textContent = item.name;
    const meta = document.createElement('small'); meta.textContent = `${formatBytes(item.size)} · ajouté ${formatDate(item.addedAt || item.createdAt, true)}`;
    copy.append(name, meta);
    const actions = document.createElement('div'); actions.className = 'attachment-actions';
    for (const [action, label] of [['open', 'Ouvrir'], ['download', 'Télécharger'], ['remove', 'Retirer']]) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.action = action; button.textContent = label;
      actions.appendChild(button);
    }
    row.append(icon, copy, actions);
    root.appendChild(row);
  }
}

async function addPdfFiles(files) {
  if (!files.length) return;
  if (!currentRecord) currentRecord = createEmptyRecord();
  currentRecord.attachments ||= [];
  for (const file of files) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast(`${file.name} n'est pas un PDF.`, 'error');
      continue;
    }
    if (file.size > MAX_PDF_SIZE) {
      showToast(`${file.name} dépasse la limite de 25 Mo.`, 'error');
      continue;
    }
    currentRecord.attachments.push({
      id: uid(), name: file.name, type: 'application/pdf', size: file.size,
      addedAt: new Date().toISOString(), blob: file
    });
  }
  renderAttachments();
  await saveCurrent(true);
  showToast('PDF ajouté au dossier et enregistré localement.');
}

function handleAttachmentAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || !currentRecord) return;
  const row = button.closest('.attachment-item');
  const item = currentRecord.attachments?.find(att => att.id === row?.dataset.id);
  if (!item) return;
  const action = button.dataset.action;
  if (action === 'remove') {
    currentRecord.attachments = currentRecord.attachments.filter(att => att.id !== item.id);
    renderAttachments();
    saveCurrent(true);
    showToast('Pièce jointe retirée du dossier.');
    return;
  }
  if (!item.blob) {
    showToast('Le fichier joint est absent de cette sauvegarde.', 'error');
    return;
  }
  const url = URL.createObjectURL(item.blob);
  if (action === 'open') {
    const opened = window.open(url, '_blank', 'noopener');
    if (!opened) showToast('Autorisez les fenêtres contextuelles pour ouvrir le PDF.', 'error');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } else if (action === 'download') {
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = item.name;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
}

function optionLabel(f, value) {
  if (value === OTHER_VALUE) return `Autre${f.name && $('#observation-form [name="' + f.name + '__other"]')?.value ? ` : ${$('#observation-form [name="' + f.name + '__other"]').value}` : ''}`;
  return value;
}

function displayFieldValue(f, data) {
  if (f.type === 'computed') {
    const value = f.name === 'imc_calcule' ? (data.imc_calcule ? `${data.imc_calcule} kg/m²` : '') : (data.gcs_total ? `${data.gcs_total}/15` : '');
    return value;
  }
  const raw = data[f.name];
  let output = '';
  if (f.type === 'checks') {
    const values = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    output = values.map(v => v === OTHER_VALUE ? `Autre${data[`${f.name}__other`] ? ` : ${data[`${f.name}__other`]}` : ''}` : v).join(' ; ');
  } else if (f.type === 'radio' || f.type === 'select') {
    output = raw === OTHER_VALUE ? `Autre${data[`${f.name}__other`] ? ` : ${data[`${f.name}__other`]}` : ''}` : (raw || '');
  } else {
    output = raw || '';
  }
  if (f.unit && output) output = `${output} ${f.unit}`;
  return String(output).trim();
}

function buildPrintDocument() {
  const data = getFormData();
  const patient = data.patient_nom || 'Patient sans nom';
  const date = data.date_observation || todayISO();
  const sectionsHtml = schema.map(section => {
    const groupsHtml = section.groups.map(group => {
      const rows = group.fields.map(f => {
        const value = displayFieldValue(f, data);
        if (!value) return '';
        return `<div class="print-row"><div class="print-label">${escapeHtml(f.label)}</div><div class="print-value">${escapeHtml(value).replace(/\n/g, '<br>')}</div></div>`;
      }).filter(Boolean).join('');
      return rows ? `<section class="print-group"><h3>${escapeHtml(group.title)}</h3>${rows}</section>` : '';
    }).join('');
    return groupsHtml ? `<section class="print-section"><h2><span>${escapeHtml(section.number)}</span>${escapeHtml(section.title)}</h2>${groupsHtml}</section>` : '';
  }).join('');

  const attachmentHtml = (currentRecord?.attachments || []).length
    ? `<section class="print-section"><h2>Documents associés</h2><p>${currentRecord.attachments.map(a => escapeHtml(a.name)).join('<br>')}</p></section>`
    : '';

  const printTitle = `Observation_${patient.replace(/[^a-z0-9-_]/gi, '_')}_${date}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(printTitle)}</title>
    <style>
      @page { size: A4; margin: 14mm 13mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #1d333b; font: 10pt/1.42 Arial, sans-serif; }
      header { border-bottom: 3px solid #168b83; padding-bottom: 12px; margin-bottom: 16px; }
      .kicker { color: #168b83; font-size: 8pt; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; }
      h1 { font-size: 19pt; margin: 4px 0 5px; }
      .meta { color: #5f747b; font-size: 9pt; }
      .print-section { margin: 15px 0 17px; page-break-inside: auto; }
      .print-section > h2 { font-size: 12pt; color: #155d5a; border-bottom: 1px solid #cbdedd; padding-bottom: 6px; margin: 0 0 10px; }
      .print-section > h2 span { display: inline-block; background: #e9f6f4; color: #137a72; border-radius: 5px; padding: 3px 6px; margin-right: 7px; font-size: 9pt; }
      .print-group { margin: 10px 0 13px; page-break-inside: avoid; }
      .print-group h3 { font-size: 10pt; color: #405a63; margin: 0 0 6px; }
      .print-row { display: grid; grid-template-columns: 34% 66%; border-bottom: 1px solid #edf1f1; padding: 5px 0; gap: 10px; }
      .print-label { color: #61777e; font-weight: 700; font-size: 8.5pt; }
      .print-value { color: #243f48; overflow-wrap: anywhere; white-space: pre-wrap; }
      footer { border-top: 1px solid #dce6e7; margin-top: 20px; padding-top: 8px; color: #83949a; font-size: 8pt; }
      @media print { .print-group { break-inside: avoid; } }
    </style></head><body>
      <header><div class="kicker">ObsMéd · Dossier clinique</div><h1>Observation médicale</h1><div class="meta"><strong>Patient :</strong> ${escapeHtml(patient)} &nbsp; · &nbsp; <strong>Date :</strong> ${escapeHtml(formatDate(date))}</div>${data.clinicien ? `<div class="meta"><strong>Clinicien :</strong> ${escapeHtml(data.clinicien)}</div>` : ''}</header>
      ${sectionsHtml || '<p>Aucune donnée saisie.</p>'}${attachmentHtml}
      <footer>Document généré localement avec ObsMéd. Vérifier les données et compléter les éléments non renseignés avant toute utilisation clinique.</footer>
      <script>window.addEventListener('load', () => setTimeout(() => window.print(), 400));<\/script>
    </body></html>`;
}

function exportPdf() {
  if (!currentRecord) currentRecord = createEmptyRecord();
  currentRecord.data = getFormData();
  const popup = window.open('', '_blank');
  if (!popup) {
    showToast('Autorisez les fenêtres contextuelles pour exporter le PDF.', 'error');
    return;
  }
  popup.document.open();
  popup.document.write(buildPrintDocument());
  popup.document.close();
  showToast('Dans la fenêtre d’impression, choisissez « Enregistrer au format PDF ».');
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBlob(base64, type = 'application/pdf') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

function downloadBlob(blob, filename, type) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function exportBackup() {
  try {
    const records = await dbGetAll();
    const serializable = [];
    for (const record of records) {
      const attachments = [];
      for (const attachment of (record.attachments || [])) {
        attachments.push({
          id: attachment.id, name: attachment.name, type: attachment.type,
          size: attachment.size, addedAt: attachment.addedAt,
          base64: attachment.blob ? await blobToBase64(attachment.blob) : ''
        });
      }
      serializable.push({ ...record, attachments });
    }
    const payload = { app: 'ObsMéd', formatVersion: 1, exportedAt: new Date().toISOString(), records: serializable };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, `obsmed-sauvegarde-${todayISO()}.json`);
    showToast('Sauvegarde JSON téléchargée. Conservez-la dans un endroit sûr.');
  } catch (error) {
    console.error(error);
    showToast(`Export impossible : ${error.message}`, 'error');
  }
}

async function importBackupFile(file) {
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (!payload || payload.app !== 'ObsMéd' || !Array.isArray(payload.records)) {
      throw new Error('Ce fichier ne semble pas être une sauvegarde ObsMéd valide.');
    }
    const existing = new Set((await dbGetAll()).map(r => r.id));
    let imported = 0;
    let firstImportedId = null;
    for (const raw of payload.records) {
      const id = existing.has(raw.id) ? uid() : (raw.id || uid());
      const attachments = [];
      for (const attachment of (raw.attachments || [])) {
        attachments.push({
          id: attachment.id || uid(), name: attachment.name || 'document.pdf',
          type: attachment.type || 'application/pdf', size: attachment.size || 0,
          addedAt: attachment.addedAt || new Date().toISOString(),
          blob: attachment.base64 ? base64ToBlob(attachment.base64, attachment.type || 'application/pdf') : null
        });
      }
      const record = {
        id, createdAt: raw.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
        data: raw.data && typeof raw.data === 'object' ? raw.data : {}, attachments
      };
      await dbPut(record);
      existing.add(id);
      imported++;
      if (!firstImportedId) firstImportedId = id;
    }
    await refreshCache();
    if (firstImportedId) await loadObservation(firstImportedId);
    showToast(`${imported} observation(s) restaurée(s).`);
  } catch (error) {
    console.error(error);
    showToast(`Import impossible : ${error.message}`, 'error');
  } finally {
    $('#backup-file').value = '';
  }
}

function bindEvents() {
  $('#btn-new').addEventListener('click', createNewObservation);
  $('#btn-save').addEventListener('click', () => saveCurrent(false));
  $('#btn-pdf').addEventListener('click', exportPdf);
  $('#btn-export-backup').addEventListener('click', exportBackup);
  $('#btn-import-backup').addEventListener('click', () => $('#backup-file').click());
  $('#backup-file').addEventListener('change', event => importBackupFile(event.target.files?.[0]));
  $('#search-observations').addEventListener('input', renderObservationList);
  $('#observation-list').addEventListener('click', async event => {
    const item = event.target.closest('.observation-item');
    if (!item) return;
    const action = event.target.closest('button[data-action]')?.dataset.action;
    if (action === 'duplicate') return duplicateObservation(item.dataset.id);
    if (action === 'delete') return deleteObservation(item.dataset.id);
    return loadObservation(item.dataset.id);
  });
  $('#observation-form').addEventListener('input', event => {
    if (event.target.matches('[data-choice]')) refreshOtherInputs();
    updateCalculations();
    scheduleAutosave();
  });
  $('#observation-form').addEventListener('change', event => {
    if (event.target.matches('[data-choice]')) refreshOtherInputs();
    updateCalculations();
    scheduleAutosave();
  });
  $('#pdf-upload').addEventListener('change', async event => {
    await addPdfFiles([...(event.target.files || [])]);
    event.target.value = '';
  });
  $('#attachment-list').addEventListener('click', handleAttachmentAction);
  $('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') $('#sidebar').classList.remove('open');
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault(); saveCurrent(false);
    }
  });
}

async function init() {
  renderSchema();
  bindEvents();
  $('#today-label').textContent = formatDate(todayISO());
  try {
    await refreshCache();
    if (observationsCache.length) {
      await loadObservation(observationsCache[0].id);
    } else {
      currentRecord = createEmptyRecord();
      fillForm(currentRecord.data);
      renderAttachments();
      updatePageTitle();
      setSaveStatus('draft');
    }
  } catch (error) {
    console.error(error);
    showToast(`Le stockage local n'est pas disponible : ${error.message}`, 'error');
    setSaveStatus('error', 'Stockage indisponible');
  }
}

document.addEventListener('DOMContentLoaded', init);
