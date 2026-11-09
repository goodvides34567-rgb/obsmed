# ObsMéd — Site local d'observations médicales

Application web en HTML, CSS et JavaScript, conçue pour être ouverte avec Visual Studio Code. Aucun compte, serveur, base de données distante ou installation de dépendance n'est nécessaire.

## 1. Ouvrir le projet dans VS Code

1. Téléchargez et décompressez `observation-medicale-vscode.zip`.
2. Ouvrez Visual Studio Code.
3. Cliquez sur **File > Open Folder…** puis sélectionnez le dossier `observation-medicale-vscode`.
4. Vous devez voir ces fichiers dans l'explorateur :
   - `index.html`
   - `style.css`
   - `app.js`
   - `README.md`
5. Pour lancer le site, installez l'extension **Live Server** si elle n'est pas déjà présente :
   - Cliquez sur l'icône **Extensions** à gauche.
   - Recherchez `Live Server`.
   - Cliquez sur **Install**.
   - Faites un clic droit sur `index.html` puis **Open with Live Server**.
6. Le site s'ouvre dans votre navigateur. Gardez le même navigateur et le même profil pour retrouver les observations enregistrées.

> Vous pouvez aussi ouvrir `index.html` directement dans Chrome, mais Live Server est recommandé pour conserver un comportement stable du stockage local.

## 2. Fonctionnalités

- Formulaire détaillé construit à partir des rubriques des documents fournis : interrogatoire, antécédents, HDM, constantes, Glasgow, examen clinique par appareil, synthèse, examens complémentaires et CAT.
- Choix à cocher ou à sélectionner. Les champs de choix proposent automatiquement **Autre** avec une zone de précision.
- Calcul automatique de l'IMC et du score de Glasgow lorsque les éléments nécessaires sont renseignés.
- Création de plusieurs observations.
- Sauvegarde automatique après modification et bouton **Enregistrer** (`Ctrl + S` / `Cmd + S`).
- Réouverture, modification, duplication et suppression d'une observation.
- Ajout de PDF au dossier, conservation locale, ouverture et téléchargement du fichier joint.
- Export de l'observation au format PDF via la fenêtre d'impression du navigateur : choisir **Enregistrer au format PDF** comme destination.
- Export et restauration d'une sauvegarde JSON. Cette sauvegarde transporte les champs et les pièces jointes PDF.

## 3. Où sont enregistrées les données ?

Les observations et les PDF sont conservés dans **IndexedDB**, dans le navigateur utilisé. Cela signifie :

- les dossiers restent sur cet ordinateur et dans ce navigateur ;
- ils ne sont pas envoyés sur Internet ;
- ils ne sont pas automatiquement synchronisés avec un autre ordinateur ou téléphone ;
- effacer les données du navigateur peut supprimer les dossiers.

Utilisez régulièrement **Exporter une sauvegarde** et conservez le fichier JSON dans un endroit sûr. Pour retrouver les observations sur un autre ordinateur, ouvrez ObsMéd puis cliquez sur **Restaurer une sauvegarde**.

## 4. Importer un ancien PDF et le modifier

Un PDF importé est stocké comme **pièce jointe** du dossier : vous pouvez le rouvrir et le télécharger plus tard. Un PDF quelconque n'est pas transformé automatiquement en champs de formulaire modifiables : les PDF peuvent être scannés, protégés ou présenter des mises en page différentes. Pour créer une observation éditable à partir d'un ancien PDF, reportez ses informations dans le formulaire. Pour reprendre une observation ObsMéd déjà structurée, restaurez plutôt sa sauvegarde JSON.

## 5. Export PDF

Cliquez sur **Exporter en PDF**. Une page propre à imprimer s'ouvre dans un nouvel onglet. Dans la fenêtre d'impression, sélectionnez :

- **Destination :** Enregistrer au format PDF ;
- **Format :** A4 ;
- puis **Enregistrer**.

Le navigateur impose cette étape de confirmation ; un site local ne peut pas enregistrer silencieusement un PDF dans le dossier Téléchargements sans action de l'utilisateur.

## 6. Confidentialité et usage clinique

Cette application est un outil de rédaction et d'organisation, pas un logiciel de dossier patient certifié ni un outil d'aide au diagnostic. Ne saisissez pas de données nominatives de patients sur un appareil partagé ou non sécurisé. Vérifiez les informations avant impression et respectez les règles de confidentialité et les procédures de votre établissement. Documentez uniquement les examens réellement réalisés et les résultats effectivement constatés.
