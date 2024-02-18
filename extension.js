const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

function activate(context) {
	let disposable = vscode.commands.registerCommand(
		"extension.bulkConvertImages",
		async (uri) => {
			const formats = [
				{ label: "JPEG", value: "jpeg" },
				{ label: "PNG", value: "png" },
				{ label: "WebP", value: "webp" },
				// Ajoutez d'autres formats supportés par Sharp ici
			];

			const formatChoice = await vscode.window.showQuickPick(formats, {
				placeHolder: "Sélectionnez le format de sortie",
			});

			if (!formatChoice) {
				return; // L'utilisateur a annulé l'opération
			}

			const format = formatChoice.value;

			let filePaths = [];

			if (uri && uri.fsPath) {
				filePaths.push(uri.fsPath);
			} else {
				const result = await vscode.window.showOpenDialog({
					canSelectFiles: true,
					canSelectFolders: true,
					canSelectMany: true,
					openLabel: "Sélectionner",
				});

				if (!result || result.length === 0) {
					vscode.window.showErrorMessage(
						"Aucun fichier ou dossier sélectionné."
					);
					return;
				}

				filePaths = result.map((file) => file.fsPath);
			}

			try {
				await Promise.all(
					filePaths.map(async (filePath) => {
						const stat = await fs.promises.stat(filePath);

						if (stat.isFile()) {
							await convertImage(filePath, format);
						} else if (stat.isDirectory()) {
							const files = await fs.promises.readdir(filePath);
							const imageFiles = files.filter((fileName) =>
								[
									".png",
									".jpg",
									".jpeg",
									".webp",
									".tiff",
									".heic",
									".PNG",
									".JPG",
									".JPEG",
									".WEBP",
									".TIFF",
									".HEIC",
								].includes(path.extname(fileName).toLowerCase())
							);

							await Promise.all(
								imageFiles.map(async (fileName) => {
									const imagePath = path.join(
										filePath,
										fileName
									);
									await convertImage(imagePath, format);
								})
							);
						}
					})
				);
			} catch (error) {
				vscode.window.showErrorMessage(
					`Une erreur s'est produite lors de la conversion des images : ${error}`
				);
			}
		}
	);

	context.subscriptions.push(disposable);
}

async function convertImage(filePath, format) {
	const imageExtension = path.extname(filePath).toLowerCase();
	if (
		![
			".png",
			".jpg",
			".jpeg",
			".webp",
			".tiff",
			".heic",
			".PNG",
			".JPG",
			".JPEG",
			".WEBP",
			".TIFF",
			".HEIC",
		].includes(imageExtension)
	) {
		vscode.window.showErrorMessage(
			`Le fichier ${path.basename(
				filePath
			)} n'est pas pris en charge. Seuls les fichiers PNG, JPG et JPEG sont supportés.`
		);
		return;
	}

	const imageBuffer = await fs.promises.readFile(filePath);
	const outputFormat = format === "jpeg" ? "jpg" : format; // Sharp utilise 'jpg' au lieu de 'jpeg'

	const convertedImageBuffer = await sharp(imageBuffer)
		.toFormat(outputFormat)
		.toBuffer();

	const convertedFileName = path
		.basename(filePath)
		.replace(
			/\.(png|jpg|jpeg|webp|tiff|heic|PNG|JPG|JPEG|WEBP|TIFF|HEIC)$/,
			`.${outputFormat}`
		);
	const outputPath = path.join(path.dirname(filePath), convertedFileName);

	await fs.promises.writeFile(outputPath, convertedImageBuffer);

	vscode.window.showInformationMessage(
		`L'image ${path.basename(
			filePath
		)} a été convertie en format ${format.toUpperCase()} et enregistrée sous ${path.basename(
			outputPath
		)}`
	);
}

function deactivate() {
	// Clean up resources here if necessary
}

module.exports = {
	activate,
	deactivate,
};
