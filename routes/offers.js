const express = require("express");
const router = express.Router();
const cloudinary = require("cloudinary").v2;
const fileUpload = require("express-fileupload");

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

const Offer = require("../models/Offer");
const User = require("../models/User");

// 1 Créer une offre sans ref sans photo et sans le middleware
// 2 Créer une offre sans ref avec une photo
// 3 Créer une offre avec une ref avec une photo et avec le middleware

const convertToBase64 = (file) => {
  return `data:${file.mimetype};base64,${file.data.toString("base64")}`;
};

const isAuthenticated = async (req, res, next) => {
  //   console.log(req.headers);
  // Cette condition sert à vérifier si j'envoie un token
  if (req.headers.authorization) {
    const user = await User.findOne({
      token: req.headers.authorization.replace("Bearer ", ""),
    });
    // Cette condition sert à vérifier si j'envoie un token valide !

    if (user) {
      //Mon token est valide et je peux continuer
      //J'envoie les infos sur mon user à la route /offer/publish
      req.user = user;
      next();
    } else {
      res.status(401).json({ error: "Token présent mais non valide !" });
    }
  } else {
    res.status(401).json({ error: "Token non envoyé !" });
  }
};

router.post(
  "/offer/publish",
  isAuthenticated,
  fileUpload(),
  async (req, res) => {
    try {
      console.log(req.body);
      console.log(req.files);
      const newOffer = new Offer({
        product_name: req.body.title,
        product_description: req.body.description,
        product_price: req.body.price,
        product_details: [
          { MARQUE: req.body.brand },
          { TAILLE: req.body.size },
          { ETAT: req.body.condition },
          { COULEUR: req.body.color },
          { EMPLACEMENT: req.body.city },
        ],
        owner: req.user,
      });

      //J'envoie mon image sur cloudinary, juste après avoir crée en DB mon offre
      // Comme ça j'ai accès à mon ID
      const result = await cloudinary.uploader.upload(
        convertToBase64(req.files.picture),
        {
          folder: "vinted/offers",
          public_id: `${req.body.title} - ${newOffer._id}`,
          //Old WAY JS
          // public_id: req.body.title + " " + newOffer._id,
        }
      );

      // console.log(result);
      //je viens rajouter l'image à mon offre
      newOffer.product_image = result;

      await newOffer.save();

      res.json(newOffer);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
);

router.get("/offers", async (req, res) => {
  const filtersObject = {};

  if (req.query.title) {
    filtersObject.product_name = new RegExp(req.query.title, "i");
  }

  if (req.query.priceMin) {
    filtersObject.product_price = { $gte: req.query.priceMin };
  }

  //Si j'ai une déjà une clé product_price dans min object objectFilter
  if (req.query.priceMax) {
    if (filtersObject.product_price) {
      filtersObject.product_price.$lte = req.query.priceMax;
    } else {
      filtersObject.product_price = { $lte: req.query.priceMax };
    }
  }

  // console.log(filtersObject);

  //gestion du tri avec l'objet sortObject
  const sortObject = {};

  if (req.query.sort === "price-desc") {
    sortObject.product_price = "desc";
  } else if (req.query.sort === "price-asc") {
    sortObject.product_price = "asc";
  }

  // console.log(sortObject);

  //gestion de la pagination
  //On a par défaut 3 annonces par page
  //Si je suis sur la page 1 => je devrais skip 0 annonces
  //Si je suis sur la page 2 => je devrais skip 3 annonces
  //Si je suis sur la page 3 => je devrais skip 6 annonces
  //Si je suis sur la page 4 => je devrais skip 9 annonces

  // (1-1) * 3 = skip 0 ==> Page 1
  // (2-1) * 3 = skip 3 ==> Page 2
  // (3-1) * 3 = skip 6 ==> Page 3
  // (4-1) * 3 = skip 9 ==> Page 4

  let limit = 3;
  if (req.query.limit) {
    limit = req.query.limit;
  }

  let page = 1;
  if (req.query.page) {
    page = req.query.page;
  }

  const offers = await Offer.find(filtersObject)
    .sort(sortObject)
    .select("product_name product_price")
    .limit(limit)
    .skip((page - 1) * limit);

  const count = await Offer.countDocuments(filtersObject);

  res.json({ count: count, offers: offers });
});

router.get("/offer/:id", async (req, res) => {
  console.log(req.params);
  try {
    const offer = await Offer.findById(req.params.id).populate({
      path: "owner",
      select: "account.username email",
    });
    res.json(offer);
  } catch (error) {
    res.status(400).json(error.message);
  }
});

module.exports = router;
